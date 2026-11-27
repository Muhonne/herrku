import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authHeaders,
  createMember,
  createTestApp,
  loginAs,
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

async function setup(): Promise<TestApp> {
  const testApp = await createTestApp()
  open.push(testApp)
  return testApp
}

const recipePayload = {
  title: 'Token Bread',
  servings: 4,
  ingredients: [{ rawText: '2 cups flour' }],
  steps: [{ text: 'Bake.' }],
}

function bearer(secret: string, headers: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${secret}`, ...headers }
}

async function issueToken(
  app: TestApp['app'],
  cookie: string,
  body: { name: string; expiresInDays?: number | null } = { name: 'cli' },
) {
  return app.inject({
    method: 'POST',
    url: '/api/tokens',
    headers: authHeaders(cookie, { 'content-type': 'application/json' }),
    payload: body,
  })
}

describe('api tokens', () => {
  it('requires a session or token to manage tokens', async () => {
    const { app } = await setup()
    const list = await app.inject({ method: 'GET', url: '/api/tokens' })
    expect(list.statusCode).toBe(401)

    const create = await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { name: 'cli' },
    })
    expect(create.statusCode).toBe(401)
  })

  it('issues a token once, stores only its hash, and lists only a prefix', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)

    const created = await issueToken(testApp.app, cookie, { name: 'laptop' })
    expect(created.statusCode).toBe(201)
    const body = created.json()
    expect(body.secret.startsWith('hk_')).toBe(true)
    expect(body.token).toMatchObject({ name: 'laptop', prefix: body.secret.slice(0, 11) })
    expect(body.token.expiresAt).toBeNull()

    const raw = new Database(join(testApp.dir, 'db.sqlite'))
    const row = raw.prepare('select token_hash, prefix from api_tokens').get() as {
      token_hash: string
      prefix: string
    }
    raw.close()
    expect(row.token_hash).not.toBe(body.secret)
    expect(row.token_hash).toHaveLength(64)
    expect(row.prefix).toBe(body.secret.slice(0, 11))

    const list = await testApp.app.inject({
      method: 'GET',
      url: '/api/tokens',
      headers: authHeaders(cookie),
    })
    expect(list.statusCode).toBe(200)
    const listed = list.json().tokens[0]
    expect(listed).toMatchObject({ name: 'laptop', prefix: body.secret.slice(0, 11) })
    expect(JSON.stringify(listed)).not.toContain(body.secret)
    expect(listed.tokenHash).toBeUndefined()
  })

  it('authenticates requests with a bearer token', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const secret = (await issueToken(testApp.app, cookie)).json().secret

    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: bearer(secret),
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().user).toMatchObject({ username: 'admin', role: 'admin' })

    const list = await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: bearer(secret),
    })
    expect(list.statusCode).toBe(200)
  })

  it('accepts bearer mutations without an Origin header, while cookies still require CSRF', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const secret = (await issueToken(testApp.app, cookie)).json().secret

    const withToken = await testApp.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: bearer(secret, { 'content-type': 'application/json' }),
      payload: recipePayload,
    })
    expect(withToken.statusCode).toBe(201)

    const withCookie = await testApp.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { ...recipePayload, title: 'No origin' },
    })
    expect(withCookie.statusCode).toBe(403)
    expect(withCookie.json().error.code).toBe('csrf_failed')
  })

  it('rejects unknown, revoked and expired tokens', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)

    const unknown = await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: bearer('hk_not-a-real-token'),
    })
    expect(unknown.statusCode).toBe(401)

    const created = (await issueToken(testApp.app, cookie)).json()
    const revoked = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/tokens/${created.token.id}`,
      headers: authHeaders(cookie),
    })
    expect(revoked.statusCode).toBe(204)

    const afterRevoke = await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: bearer(created.secret),
    })
    expect(afterRevoke.statusCode).toBe(401)

    const expiring = (await issueToken(testApp.app, cookie, { name: 'old', expiresInDays: 1 })).json()
    const raw = new Database(join(testApp.dir, 'db.sqlite'))
    raw
      .prepare('update api_tokens set expires_at = ? where id = ?')
      .run(new Date(Date.now() - 1000).toISOString(), expiring.token.id)
    raw.close()

    const afterExpiry = await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: bearer(expiring.secret),
    })
    expect(afterExpiry.statusCode).toBe(401)
  })

  it('rejects tokens belonging to disabled users', async () => {
    const testApp = await setup()
    const admin = await loginAs(testApp.app)
    const member = await createMember(testApp.app, admin, 'friend')
    const memberSecret = (await issueToken(testApp.app, member)).json().secret

    const users = await testApp.app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: authHeaders(admin),
    })
    const friend = users.json().users.find((user: { username: string }) => user.username === 'friend')
    await testApp.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${friend.id}`,
      headers: authHeaders(admin, { 'content-type': 'application/json' }),
      payload: { disabled: true },
    })

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: bearer(memberSecret),
    })
    expect(response.statusCode).toBe(401)
  })

  it('keeps role rules for token-authenticated requests', async () => {
    const testApp = await setup()
    const admin = await loginAs(testApp.app)
    const member = await createMember(testApp.app, admin, 'friend')
    const memberSecret = (await issueToken(testApp.app, member)).json().secret

    const forbidden = await testApp.app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: bearer(memberSecret),
    })
    expect(forbidden.statusCode).toBe(403)
  })

  it('tracks last use and lets the owner revoke a token', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const created = (await issueToken(testApp.app, cookie, { name: 'ops' })).json()

    await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: bearer(created.secret),
    })

    const list = await testApp.app.inject({
      method: 'GET',
      url: '/api/tokens',
      headers: authHeaders(cookie),
    })
    const listed = list.json().tokens.find((token: { id: number }) => token.id === created.token.id)
    expect(listed.lastUsedAt).not.toBeNull()

    const revoked = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/tokens/${created.token.id}`,
      headers: authHeaders(cookie),
    })
    expect(revoked.statusCode).toBe(204)

    const gone = await testApp.app.inject({
      method: 'GET',
      url: '/api/tokens',
      headers: authHeaders(cookie),
    })
    expect(gone.json().tokens).toHaveLength(0)
  })

  it('does not allow deleting someone else\u2019s token', async () => {
    const testApp = await setup()
    const admin = await loginAs(testApp.app)
    const member = await createMember(testApp.app, admin, 'friend')
    const adminToken = (await issueToken(testApp.app, admin, { name: 'admin-cli' })).json()

    const attempt = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/tokens/${adminToken.token.id}`,
      headers: authHeaders(member),
    })
    expect(attempt.statusCode).toBe(404)

    const stillValid = await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: bearer(adminToken.secret),
    })
    expect(stillValid.statusCode).toBe(200)
  })

  it('validates token names and expiry values', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)

    const emptyName = await issueToken(testApp.app, cookie, { name: '' })
    expect(emptyName.statusCode).toBe(400)
    expect(emptyName.json().error.code).toBe('validation_failed')

    const badExpiry = await testApp.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: authHeaders(cookie, { 'content-type': 'application/json' }),
      payload: { name: 'bad', expiresInDays: 0 },
    })
    expect(badExpiry.statusCode).toBe(400)
  })

  it('supports the shopping list and recipe search through a token', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const secret = (await issueToken(testApp.app, cookie)).json().secret

    const recipe = await testApp.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: bearer(secret, { 'content-type': 'application/json' }),
      payload: recipePayload,
    })
    expect(recipe.statusCode).toBe(201)

    const search = await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes?q=token',
      headers: bearer(secret),
    })
    expect(search.json().total).toBe(1)

    const shopping = await testApp.app.inject({
      method: 'POST',
      url: '/api/shopping-list',
      headers: bearer(secret, { 'content-type': 'application/json' }),
      payload: { items: [{ recipeId: recipe.json().id }] },
    })
    expect(shopping.statusCode).toBe(200)
    expect(shopping.json().text).toContain('flour')
  })
})
