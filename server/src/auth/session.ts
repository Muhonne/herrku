import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Config } from '../config.js'
import { forbidden, unauthorized } from '../lib/errors.js'

export interface SessionUser {
  id: number
  username: string
  displayName: string
  role: 'admin' | 'member'
}

export function cookieName(secure: boolean): string {
  return secure ? '__Host-herrku_session' : 'herrku_session'
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  config: Config,
  persistent: boolean,
): void {
  reply.setCookie(cookieName(config.cookieSecure), token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    ...(persistent ? { maxAge: config.sessionTtlDays * 86_400 } : {}),
  })
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(cookieName(config.cookieSecure), { path: '/' })
}

export function requestOrigin(request: FastifyRequest): string | null {
  const origin = request.headers.origin
  if (typeof origin === 'string' && origin !== 'null') return origin

  const referer = request.headers.referer
  if (typeof referer === 'string') {
    try {
      const parsed = new URL(referer)
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      return null
    }
  }

  return null
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (!request.user) throw unauthorized()
}

export async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (!request.user) throw unauthorized()
  if (request.user.role !== 'admin') throw forbidden('Admin access required')
}
