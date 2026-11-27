import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadConfig, type Config } from '../src/config.js'

export const ORIGIN = 'http://localhost:3000'
export const ADMIN_USERNAME = 'admin'
export const ADMIN_PASSWORD = 'admin-password-123'

export interface TestApp {
  app: FastifyInstance
  config: Config
  dir: string
}

export async function createTestApp(overrides: Partial<Config> = {}): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), 'herrku-test-'))
  const base = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dir,
    PUBLIC_URL: ORIGIN,
    ALLOWED_ORIGINS: ORIGIN,
    COOKIE_SECURE: 'false',
    LOG_LEVEL: 'silent',
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
  } as NodeJS.ProcessEnv)

  const config: Config = { ...base, rateLimit: false, ...overrides }
  const app = await buildApp({ config, logger: false })
  await app.ready()
  return { app, config, dir }
}

export const withOrigin = (headers: Record<string, string> = {}): Record<string, string> => ({
  origin: ORIGIN,
  ...headers,
})

export function setCookieHeader(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie']
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : ''
}

export function sessionCookie(response: { headers: Record<string, unknown> }): string {
  const header = setCookieHeader(response)
  return header.split(';')[0] ?? ''
}

export function authHeaders(cookie: string, headers: Record<string, string> = {}): Record<string, string> {
  return withOrigin({ cookie, ...headers })
}

export async function loginAs(
  app: FastifyInstance,
  username = ADMIN_USERNAME,
  password = ADMIN_PASSWORD,
  staySignedIn = true,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: withOrigin({ 'content-type': 'application/json' }),
    payload: { username, password, staySignedIn },
  })
  if (response.statusCode !== 200) {
    throw new Error(`login failed: ${response.statusCode} ${response.body}`)
  }
  return sessionCookie(response)
}

export async function createInvite(
  app: FastifyInstance,
  cookie: string,
  role: 'admin' | 'member' = 'member',
): Promise<{ id: number; url: string; expiresAt: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/invites',
    headers: authHeaders(cookie, { 'content-type': 'application/json' }),
    payload: { role },
  })
  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(`invite failed: ${response.statusCode} ${response.body}`)
  }
  return response.json()
}

export function tokenFromInviteUrl(url: string): string {
  const parsed = new URL(url)
  return parsed.pathname.split('/').pop() ?? ''
}

export async function createMember(
  app: FastifyInstance,
  adminCookie: string,
  username: string,
  password = 'member-password-1',
  role: 'admin' | 'member' = 'member',
): Promise<string> {
  const invite = await createInvite(app, adminCookie, role)
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/auth/accept-invite',
    headers: withOrigin({ 'content-type': 'application/json' }),
    payload: { token: tokenFromInviteUrl(invite.url), username, password },
  })
  if (accepted.statusCode !== 201) {
    throw new Error(`member invite failed: ${accepted.statusCode} ${accepted.body}`)
  }
  return loginAs(app, username, password)
}

export function multipartPayload(
  file: Buffer,
  options: { field?: string; filename?: string; contentType?: string } = {},
): { payload: Buffer; contentType: string } {
  const boundary = '----herrkuTestBoundary'
  const field = options.field ?? 'file'
  const filename = options.filename ?? 'photo.jpg'
  const type = options.contentType ?? 'image/jpeg'
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    payload: Buffer.concat([head, file, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}


