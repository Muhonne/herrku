import type { FastifyInstance } from 'fastify'
import { apiTokenCreateSchema } from '@herrku/shared'
import { requireAuth, type SessionUser } from '../auth/session.js'
import { notFound } from '../lib/errors.js'
import { generateApiToken } from '../lib/api-tokens.js'

interface TokenRow {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}

function toToken(row: TokenRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
  }
}

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tokens', { preHandler: requireAuth }, async (request) => {
    const user = request.user as SessionUser
    const rows = await app.db
      .selectFrom('api_tokens')
      .select(['id', 'name', 'prefix', 'created_at', 'last_used_at', 'expires_at'])
      .where('user_id', '=', user.id)
      .orderBy('created_at', 'desc')
      .execute()

    return { tokens: rows.map(toToken) }
  })

  app.post('/api/tokens', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user as SessionUser
    const body = apiTokenCreateSchema.parse(request.body)
    const generated = generateApiToken()
    const now = new Date()
    const expiresAt =
      body.expiresInDays === null
        ? null
        : new Date(now.getTime() + body.expiresInDays * 86_400_000).toISOString()

    const inserted = await app.db
      .insertInto('api_tokens')
      .values({
        user_id: user.id,
        name: body.name,
        token_hash: generated.hash,
        prefix: generated.prefix,
        created_at: now.toISOString(),
        last_used_at: null,
        expires_at: expiresAt,
      })
      .returning(['id', 'created_at'])
      .executeTakeFirstOrThrow()

    return reply.code(201).send({
      secret: generated.token,
      token: toToken({
        id: inserted.id,
        name: body.name,
        prefix: generated.prefix,
        created_at: inserted.created_at,
        last_used_at: null,
        expires_at: expiresAt,
      }),
    })
  })

  app.delete('/api/tokens/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user as SessionUser
    const id = Number((request.params as { id: string }).id)

    const result = await app.db
      .deleteFrom('api_tokens')
      .where('id', '=', id)
      .where('user_id', '=', user.id)
      .executeTakeFirst()

    if (Number(result.numDeletedRows) === 0) throw notFound('Token not found')
    return reply.code(204).send()
  })
}
