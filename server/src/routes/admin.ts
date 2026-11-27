import type { FastifyInstance } from 'fastify'
import { inviteCreateSchema, userPatchSchema } from '@herrku/shared'
import { requireAdmin } from '../auth/session.js'
import { HttpError, conflict, forbidden, notFound } from '../lib/errors.js'
import { createInviteRecord, inviteUrl } from '../lib/invites.js'

const RESET_TTL_MS = 60 * 60_000

function requirePublicUrl(app: FastifyInstance): string {
  if (!app.config.publicUrl) {
    throw new HttpError(503, 'not_configured', 'PUBLIC_URL is not configured')
  }
  return app.config.publicUrl
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
    const rows = await app.db
      .selectFrom('users')
      .select(['id', 'username', 'display_name', 'role', 'disabled_at', 'last_login_at', 'created_at'])
      .orderBy('id', 'asc')
      .execute()

    return {
      users: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name ?? row.username,
        role: row.role,
        disabled: row.disabled_at !== null,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
      })),
    }
  })

  app.patch('/api/admin/users/:id', { preHandler: requireAdmin }, async (request) => {
    const id = Number((request.params as { id: string }).id)
    const patch = userPatchSchema.parse(request.body)

    const target = await app.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
    if (!target) throw notFound('User not found')

    const willDisable = patch.disabled === true && target.disabled_at === null
    const willDemote = patch.role === 'member' && target.role === 'admin'
    const activeAdmin = target.role === 'admin' && target.disabled_at === null

    if (activeAdmin && (willDisable || willDemote)) {
      const count = await app.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('role', '=', 'admin')
        .where('disabled_at', 'is', null)
        .executeTakeFirstOrThrow()

      if (Number(count.count) <= 1) {
        throw conflict('last_admin', 'At least one active admin is required')
      }
    }

    if (target.id === request.user?.id && (willDisable || willDemote)) {
      throw forbidden('You cannot disable or demote yourself')
    }

    const now = new Date().toISOString()
    const update: {
      role?: 'admin' | 'member'
      disabled_at?: string | null
      updated_at: string
    } = { updated_at: now }
    if (patch.role !== undefined) update.role = patch.role
    if (patch.disabled === true) update.disabled_at = now
    if (patch.disabled === false) update.disabled_at = null

    await app.db.updateTable('users').set(update).where('id', '=', id).execute()
    if (willDisable) {
      await app.db.deleteFrom('sessions').where('user_id', '=', id).execute()
    }

    const updated = await app.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    return {
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name ?? updated.username,
        role: updated.role,
        disabled: updated.disabled_at !== null,
        createdAt: updated.created_at,
        lastLoginAt: updated.last_login_at,
      },
    }
  })

  app.post('/api/admin/users/:id/reset', { preHandler: requireAdmin }, async (request) => {
    const id = Number((request.params as { id: string }).id)
    const target = await app.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
    if (!target) throw notFound('User not found')

    const publicUrl = requirePublicUrl(app)
    const invite = createInviteRecord(app, {
      purpose: 'reset',
      role: target.role,
      createdBy: request.user?.id ?? null,
      userId: target.id,
      ttlMs: RESET_TTL_MS,
    })
    await app.db.deleteFrom('sessions').where('user_id', '=', target.id).execute()

    return { url: inviteUrl(publicUrl, invite.token), expiresAt: invite.expiresAt }
  })

  app.post('/api/admin/invites', { preHandler: requireAdmin }, async (request, reply) => {
    const body = inviteCreateSchema.parse(request.body ?? {})
    const publicUrl = requirePublicUrl(app)

    const invite = createInviteRecord(app, {
      purpose: 'invite',
      role: body.role,
      createdBy: request.user?.id ?? null,
      ttlMs: app.config.inviteTtlHours * 3_600_000,
    })

    return reply.code(201).send({
      id: invite.id,
      url: inviteUrl(publicUrl, invite.token),
      expiresAt: invite.expiresAt,
    })
  })

  app.get('/api/admin/invites', { preHandler: requireAdmin }, async () => {
    const rows = await app.db
      .selectFrom('invites')
      .select(['id', 'role', 'created_at', 'expires_at', 'created_by'])
      .where('purpose', '=', 'invite')
      .where('used_at', 'is', null)
      .where('expires_at', '>', new Date().toISOString())
      .orderBy('created_at', 'desc')
      .execute()

    return {
      invites: rows.map((row) => ({
        id: row.id,
        role: row.role,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        createdBy: row.created_by,
      })),
    }
  })

  app.delete('/api/admin/invites/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id)
    await app.db.deleteFrom('invites').where('id', '=', id).execute()
    return reply.code(204).send()
  })
}
