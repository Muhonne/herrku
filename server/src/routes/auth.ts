import type { FastifyInstance } from 'fastify'
import { acceptInviteSchema, loginSchema, passwordChangeSchema } from '@herrku/shared'
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
} from '../auth/session.js'
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js'
import { findValidInvite } from '../lib/invites.js'
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../lib/password.js'
import { randomToken, sha256 } from '../lib/tokens.js'
import type { SessionUser } from '../auth/session.js'

interface UserRow {
  id: number
  username: string
  display_name: string | null
  password_hash: string
  role: 'admin' | 'member'
  disabled_at: string | null
}

export function toSessionUser(row: {
  id: number
  username: string
  display_name: string | null
  role: 'admin' | 'member'
}): SessionUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? row.username,
    role: row.role,
  }
}

const INVALID_CREDENTIALS = 'Invalid username or password'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { config } = app
  const sensitiveConfig = config.rateLimit
    ? {
        rateLimit: {
          max: config.rateLimit.loginMax,
          timeWindow: config.rateLimit.loginWindowMs,
        },
      }
    : undefined

  app.post('/api/auth/login', { config: sensitiveConfig }, async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const row = app.sqlite
      .prepare(
        'select id, username, display_name, password_hash, role, disabled_at from users where username = ?',
      )
      .get(body.username) as UserRow | undefined

    if (!row) {
      await verifyAgainstDummy(body.password)
      throw unauthorized(INVALID_CREDENTIALS)
    }
    if (row.disabled_at) {
      await verifyAgainstDummy(body.password)
      throw unauthorized(INVALID_CREDENTIALS)
    }

    const valid = await verifyPassword(row.password_hash, body.password)
    if (!valid) throw unauthorized(INVALID_CREDENTIALS)

    const persistent = body.staySignedIn ?? true
    const token = randomToken()
    const now = new Date()
    const ttlMs = config.sessionTtlDays * 86_400_000

    await app.db
      .insertInto('sessions')
      .values({
        token_hash: sha256(token),
        user_id: row.id,
        persistent: persistent ? 1 : 0,
        created_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlMs).toISOString(),
        user_agent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      })
      .execute()

    await app.db
      .updateTable('users')
      .set({ last_login_at: now.toISOString() })
      .where('id', '=', row.id)
      .execute()

    setSessionCookie(reply, token, config, persistent)
    return reply.send({ user: toSessionUser(row) })
  })

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.sessionId !== null) {
      await app.db.deleteFrom('sessions').where('id', '=', request.sessionId).execute()
    }
    clearSessionCookie(reply, config)
    return reply.code(204).send()
  })

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    return { user: request.user }
  })

  app.post('/api/auth/password', { preHandler: requireAuth }, async (request, reply) => {
    const body = passwordChangeSchema.parse(request.body)
    const user = request.user as SessionUser

    const row = await app.db
      .selectFrom('users')
      .select(['password_hash'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()

    const valid = await verifyPassword(row.password_hash, body.currentPassword)
    if (!valid) throw unauthorized('Current password is incorrect')

    await app.db
      .updateTable('users')
      .set({ password_hash: await hashPassword(body.newPassword), updated_at: new Date().toISOString() })
      .where('id', '=', user.id)
      .execute()

    if (request.sessionId !== null) {
      await app.db
        .deleteFrom('sessions')
        .where('user_id', '=', user.id)
        .where('id', '!=', request.sessionId)
        .execute()
    }

    return reply.code(204).send()
  })

  app.get('/api/auth/invite/:token', { config: sensitiveConfig }, async (request) => {
    const { token } = request.params as { token: string }
    const invite = findValidInvite(app, token)
    if (!invite) throw badRequest('invite_invalid', 'This invite is invalid or has expired.')

    if (invite.purpose === 'reset' && invite.user_id !== null) {
      const user = await app.db
        .selectFrom('users')
        .select(['username'])
        .where('id', '=', invite.user_id)
        .executeTakeFirst()
      return { valid: true, purpose: 'reset', username: user?.username ?? null }
    }

    return { valid: true, purpose: 'invite' }
  })

  app.post('/api/auth/accept-invite', { config: sensitiveConfig }, async (request, reply) => {
    const body = acceptInviteSchema.parse(request.body)
    const invite = findValidInvite(app, body.token)
    if (!invite) throw badRequest('invite_invalid', 'This invite is invalid or has expired.')

    const now = new Date().toISOString()
    const passwordHash = await hashPassword(body.password)

    if (invite.purpose === 'invite') {
      if (!body.username) {
        throw badRequest('validation_failed', 'A username is required')
      }

      const existing = await app.db
        .selectFrom('users')
        .select(['id'])
        .where('username', '=', body.username)
        .executeTakeFirst()
      if (existing) throw conflict('username_taken', 'That username is already taken')

      const created = await app.db.transaction().execute(async (trx) => {
        const user = await trx
          .insertInto('users')
          .values({
            username: body.username as string,
            display_name: body.displayName ?? body.username ?? null,
            password_hash: passwordHash,
            role: invite.role,
            created_at: now,
            updated_at: now,
          })
          .returning(['id', 'username', 'display_name', 'role'])
          .executeTakeFirstOrThrow()

        await trx.updateTable('invites').set({ used_at: now }).where('id', '=', invite.id).execute()
        return user
      })

      return reply.code(201).send({ user: toSessionUser(created) })
    }

    if (invite.user_id === null) {
      throw badRequest('invite_invalid', 'This invite is invalid or has expired.')
    }

    await app.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ password_hash: passwordHash, updated_at: now })
        .where('id', '=', invite.user_id as number)
        .execute()
      await trx.deleteFrom('sessions').where('user_id', '=', invite.user_id as number).execute()
      await trx.updateTable('invites').set({ used_at: now }).where('id', '=', invite.id).execute()
    })

    const user = await app.db
      .selectFrom('users')
      .select(['id', 'username', 'display_name', 'role'])
      .where('id', '=', invite.user_id)
      .executeTakeFirstOrThrow()

    return reply.send({ user: toSessionUser(user) })
  })

  app.get('/api/sessions', { preHandler: requireAuth }, async (request) => {
    const rows = await app.db
      .selectFrom('sessions')
      .select(['id', 'created_at', 'last_seen_at', 'user_agent', 'ip'])
      .where('user_id', '=', request.user?.id ?? -1)
      .orderBy('last_seen_at', 'desc')
      .execute()

    return {
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        userAgent: row.user_agent,
        ip: row.ip,
        current: row.id === request.sessionId,
      })),
    }
  })

  app.delete('/api/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    const result = await app.db
      .deleteFrom('sessions')
      .where('id', '=', id)
      .where('user_id', '=', request.user?.id ?? -1)
      .executeTakeFirst()

    if (Number(result.numDeletedRows) === 0) throw notFound('Session not found')

    if (id === request.sessionId) clearSessionCookie(reply, config)
    return reply.code(204).send()
  })

  app.delete('/api/sessions', { preHandler: requireAuth }, async (request, reply) => {
    await app.db.deleteFrom('sessions').where('user_id', '=', request.user?.id ?? -1).execute()
    clearSessionCookie(reply, config)
    return reply.code(204).send()
  })
}
