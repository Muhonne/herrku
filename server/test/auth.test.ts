import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  ORIGIN,
  authHeaders,
  createInvite,
  createMember,
  createTestApp,
  loginAs,
  setCookieHeader,
  tokenFromInviteUrl,
  withOrigin,
  type TestApp,
} from './helpers.js'

const open: TestApp[] = []

afterEach(async () => {
  while (open.length > 0) {
    const testApp = open.pop()
    if (testApp) await testApp.app.close()
  }
})

async function setup(overrides: Parameters<typeof createTestApp>[0] = {}): Promise<TestApp> {
  const testApp = await createTestApp(overrides)
  open.push(testApp)
  return testApp
}

describe('bootstrap', () => {
  it('creates the first admin from env vars', async () => {
    const { app } = await setup()

    const row = app.sqlite
      .prepare('select username, role from users where username = ?')
      .get(ADMIN_USERNAME) as { username: string; role: string } | undefined

    expect(row).toMatchObject({ username: ADMIN_USERNAME, role: 'admin' })
  })

  it('does not create a second admin on the next boot', async () => {
    const testApp = await setup()
    const { buildApp } = await import('../src/app.js')
    const second = await buildApp({ config: testApp.config, logger: false })
    await second.ready()
    const count = second.sqlite.prepare('select count(*) as count from users').get() as {
      count: number
    }
    await second.close()

    expect(count.count).toBe(1)
  })
})

describe('login', () => {
  it('signs in with valid credentials', async () => {
    const { app } = await setup()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().user).toMatchObject({
      username: ADMIN_USERNAME,
      role: 'admin',
    })
    expect(setCookieHeader(response)).toContain('herrku_session=')
  })

  it('returns the same generic error for a wrong password and an unknown user', async () => {
    const { app } = await setup()

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { username: ADMIN_USERNAME, password: 'wrong-password-123' },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { username: 'nobody', password: 'wrong-password-123' },
    })

    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrong.json()).toEqual(unknown.json())
    expect(wrong.json().error.code).toBe('unauthorized')
  })

  it('sets HttpOnly, SameSite=Lax and Path=/ on the cookie', async () => {
    const { app } = await setup()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })

    const header = setCookieHeader(response)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Path=/')
    expect(header).not.toContain('Max-Age=0')
  })

  it('uses the __Host- prefixed cookie name when secure', async () => {
    const { app } = await setup({
      cookieSecure: true,
      publicUrl: 'https://herrku.example',
      allowedOrigins: ['https://herrku.example'],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://herrku.example', 'content-type': 'application/json' },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })

    expect(setCookieHeader(response)).toContain('__Host-herrku_session=')
    expect(setCookieHeader(response)).toContain('Secure')
  })

  it('honours staySignedIn by toggling cookie persistence', async () => {
    const { app } = await setup()

    const persistent = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD, staySignedIn: true },
    })
    const browserSession = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD, staySignedIn: false },
    })

    expect(setCookieHeader(persistent)).toContain('Max-Age=2592000')
    expect(setCookieHeader(browserSession)).not.toContain('Max-Age')
  })
})

describe('me and logout', () => {
  it('requires a session', async () => {
    const { app } = await setup()
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('unauthorized')
  })

  it('returns the current user', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeaders(cookie),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().user).toMatchObject({ username: ADMIN_USERNAME, role: 'admin' })
  })

  it('invalidates the session on logout', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: authHeaders(cookie),
    })
    expect(logout.statusCode).toBe(204)

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: authHeaders(cookie) })
    expect(me.statusCode).toBe(401)
  })

  it('refreshes a stale session on use', async () => {
    const { app, dir } = await setup()
    const cookie = await loginAs(app)

    const raw = new Database(join(dir, 'db.sqlite'))
    raw
      .prepare('update sessions set last_seen_at = ?, expires_at = ?')
      .run(
        new Date(Date.now() - 2 * 3600_000).toISOString(),
        new Date(Date.now() + 60_000).toISOString(),
      )
    raw.close()

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: authHeaders(cookie) })
    expect(me.statusCode).toBe(200)

    const check = new Database(join(dir, 'db.sqlite'))
    const row = check.prepare('select expires_at from sessions').get() as { expires_at: string }
    check.close()
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000)
  })

  it('lists and revokes sessions', async () => {
    const { app } = await setup()
    const first = await loginAs(app)
    const second = await loginAs(app)

    const list = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: authHeaders(first),
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().sessions).toHaveLength(2)
    const current = list.json().sessions.find((session: { current: boolean }) => session.current)
    expect(current).toBeTruthy()

    const others = list.json().sessions.filter((session: { current: boolean }) => !session.current)
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${others[0].id}`,
      headers: authHeaders(first),
    })
    expect(revoke.statusCode).toBe(204)

    const secondMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeaders(second),
    })
    expect(secondMe.statusCode).toBe(401)
  })
})

describe('invites', () => {
  it('runs the full invite flow', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const invite = await createInvite(app, admin)
    const token = tokenFromInviteUrl(invite.url)

    expect(invite.url.startsWith(`${ORIGIN}/invite/`)).toBe(true)

    const validation = await app.inject({
      method: 'GET',
      url: `/api/auth/invite/${token}`,
    })
    expect(validation.statusCode).toBe(200)
    expect(validation.json()).toEqual({ valid: true, purpose: 'invite' })

    const accept = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { token, username: 'friend', password: 'friend-password-1' },
    })
    expect(accept.statusCode).toBe(201)
    expect(accept.json().user).toMatchObject({
      username: 'friend',
      role: 'member',
      displayName: 'friend',
    })

    const friendCookie = await loginAs(app, 'friend', 'friend-password-1')
    expect(friendCookie).toContain('herrku_session=')
  })

  it('rejects a used invite', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const token = tokenFromInviteUrl((await createInvite(app, admin)).url)

    await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { token, username: 'friend', password: 'friend-password-1' },
    })

    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { token, username: 'friend2', password: 'friend-password-2' },
    })

    expect(again.statusCode).toBe(400)
    expect(again.json().error.code).toBe('invite_invalid')

    const validation = await app.inject({ method: 'GET', url: `/api/auth/invite/${token}` })
    expect(validation.statusCode).toBe(400)
  })

  it('rejects an expired invite', async () => {
    const { app, dir } = await setup()
    const admin = await loginAs(app)
    const token = tokenFromInviteUrl((await createInvite(app, admin)).url)

    const raw = new Database(join(dir, 'db.sqlite'))
    raw.prepare('update invites set expires_at = ?').run(new Date(Date.now() - 1000).toISOString())
    raw.close()

    const validation = await app.inject({ method: 'GET', url: `/api/auth/invite/${token}` })
    expect(validation.statusCode).toBe(400)
    expect(validation.json().error.code).toBe('invite_invalid')
  })

  it('rejects an unknown invite token', async () => {
    const { app } = await setup()
    const response = await app.inject({ method: 'GET', url: '/api/auth/invite/not-a-token' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('invite_invalid')
  })

  it('rejects a taken username with 409', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const token = tokenFromInviteUrl((await createInvite(app, admin)).url)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { token, username: ADMIN_USERNAME, password: 'another-password-1' },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('username_taken')
  })

  it('honours the requested role', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const token = tokenFromInviteUrl((await createInvite(app, admin, 'admin')).url)

    const accept = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { token, username: 'secondadmin', password: 'second-admin-password' },
    })

    expect(accept.json().user.role).toBe('admin')
  })
})

describe('password change and reset', () => {
  it('revokes other sessions but keeps the current one', async () => {
    const { app } = await setup()
    const first = await loginAs(app)
    const second = await loginAs(app)

    const change = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: authHeaders(first, { 'content-type': 'application/json' }),
      payload: { currentPassword: ADMIN_PASSWORD, newPassword: 'brand-new-password-1' },
    })
    expect(change.statusCode).toBe(204)

    const current = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeaders(first),
    })
    const stale = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeaders(second),
    })

    expect(current.statusCode).toBe(200)
    expect(stale.statusCode).toBe(401)
  })

  it('rejects a wrong current password', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const change = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: authHeaders(cookie, { 'content-type': 'application/json' }),
      payload: { currentPassword: 'not-the-password', newPassword: 'brand-new-password-1' },
    })

    expect(change.statusCode).toBe(401)
  })

  it('issues a reset link that sets a new password and revokes sessions', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const invite = await createInvite(app, admin)
    const inviteToken = tokenFromInviteUrl(invite.url)
    await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { token: inviteToken, username: 'friend', password: 'friend-password-1' },
    })
    const friendCookie = await loginAs(app, 'friend', 'friend-password-1')

    const users = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: authHeaders(admin),
    })
    const friend = users.json().users.find((user: { username: string }) => user.username === 'friend')

    const reset = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${friend.id}/reset`,
      headers: authHeaders(admin),
    })
    expect(reset.statusCode).toBe(200)
    const resetToken = tokenFromInviteUrl(reset.json().url)

    const validation = await app.inject({ method: 'GET', url: `/api/auth/invite/${resetToken}` })
    expect(validation.json()).toMatchObject({ valid: true, purpose: 'reset', username: 'friend' })

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { token: resetToken, password: 'friend-password-2' },
    })
    expect(accepted.statusCode).toBe(200)

    const stale = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeaders(friendCookie),
    })
    expect(stale.statusCode).toBe(401)

    const relogin = await loginAs(app, 'friend', 'friend-password-2')
    expect(relogin).toContain('herrku_session=')
  })
})

describe('csrf', () => {
  it('rejects a mutating request without an origin', async () => {
    const { app } = await setup()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('csrf_failed')
  })

  it('rejects a foreign origin', async () => {
    const { app } = await setup()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })

    expect(response.statusCode).toBe(403)
  })

  it('accepts a referer fallback when origin is absent', async () => {
    const { app } = await setup()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { referer: `${ORIGIN}/login`, 'content-type': 'application/json' },
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })

    expect(response.statusCode).toBe(200)
  })
})

describe('rate limiting', () => {
  it('returns 429 with Retry-After after too many login attempts', async () => {
    const { app } = await setup({
      rateLimit: { loginMax: 2, loginWindowMs: 60_000, globalMax: 1000, globalWindowMs: 60_000 },
    })

    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: withOrigin({ 'content-type': 'application/json' }),
        payload: { username: ADMIN_USERNAME, password: 'wrong-password-123' },
      })

    expect((await attempt()).statusCode).toBe(401)
    expect((await attempt()).statusCode).toBe(401)
    const limited = await attempt()

    expect(limited.statusCode).toBe(429)
    expect(limited.json().error.code).toBe('rate_limited')
    expect(limited.headers['retry-after']).toBeTruthy()
  })
})

describe('disabled accounts', () => {
  it('rejects live sessions once the user is disabled', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const invite = await createInvite(app, admin)
    await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: {
        token: tokenFromInviteUrl(invite.url),
        username: 'friend',
        password: 'friend-password-1',
      },
    })
    const friend = await loginAs(app, 'friend', 'friend-password-1')

    const users = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: authHeaders(admin),
    })
    const target = users.json().users.find((user: { username: string }) => user.username === 'friend')

    const disable = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${target.id}`,
      headers: authHeaders(admin, { 'content-type': 'application/json' }),
      payload: { disabled: true },
    })
    expect(disable.statusCode).toBe(200)

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeaders(friend),
    })
    expect(me.statusCode).toBe(401)
  })

  it('refuses to disable the last admin', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const users = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: authHeaders(admin),
    })
    const self = users.json().users[0]

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${self.id}`,
      headers: authHeaders(admin, { 'content-type': 'application/json' }),
      payload: { disabled: true },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('last_admin')
  })

  it('promotes a member to admin with immediate effect', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const member = await createMember(app, admin, 'friend')

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: authHeaders(member),
    })
    expect(forbidden.statusCode).toBe(403)

    const users = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: authHeaders(admin),
    })
    const friend = users.json().users.find((user: { username: string }) => user.username === 'friend')

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${friend.id}`,
      headers: authHeaders(admin, { 'content-type': 'application/json' }),
      payload: { role: 'admin' },
    })
    expect(patch.statusCode).toBe(200)

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: authHeaders(member),
    })
    expect(allowed.statusCode).toBe(200)
  })
})
