import type { FastifyInstance } from 'fastify'
import { randomToken, sha256 } from './tokens.js'

export interface InviteRow {
  id: number
  token_hash: string
  purpose: 'invite' | 'reset'
  role: 'admin' | 'member'
  user_id: number | null
  created_by: number | null
  created_at: string
  expires_at: string
  used_at: string | null
}

export function findValidInvite(app: FastifyInstance, rawToken: string): InviteRow | undefined {
  return app.sqlite
    .prepare('select * from invites where token_hash = ? and used_at is null and expires_at > ?')
    .get(sha256(rawToken), new Date().toISOString()) as InviteRow | undefined
}

export function inviteUrl(publicUrl: string, token: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/invite/${token}`
}

export function createInviteRecord(
  app: FastifyInstance,
  options: {
    purpose: 'invite' | 'reset'
    role: 'admin' | 'member'
    createdBy: number | null
    userId?: number | null
    ttlMs: number
  },
): { id: number; token: string; expiresAt: string } {
  const token = randomToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + options.ttlMs).toISOString()

  const result = app.sqlite
    .prepare(
      `insert into invites (token_hash, purpose, role, user_id, created_by, created_at, expires_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sha256(token),
      options.purpose,
      options.role,
      options.userId ?? null,
      options.createdBy,
      now.toISOString(),
      expiresAt,
    )

  return { id: Number(result.lastInsertRowid), token, expiresAt }
}
