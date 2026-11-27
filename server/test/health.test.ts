import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { createTestApp, type TestApp } from './helpers.js'

const open: TestApp[] = []

afterEach(async () => {
  while (open.length > 0) {
    const testApp = open.pop()
    if (testApp) await testApp.app.close()
  }
})

describe('health', () => {
  it('reports ok when the database answers', async () => {
    const testApp = await createTestApp()
    open.push(testApp)

    const response = await testApp.app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true, db: 'ok' })
    expect(typeof response.json().version).toBe('string')
  })

  it('is reachable without a session', async () => {
    const testApp = await createTestApp()
    open.push(testApp)

    const response = await testApp.app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
  })
})

describe('migrations', () => {
  it('creates every table from scratch', async () => {
    const testApp = await createTestApp()
    open.push(testApp)

    const tables = testApp.app.sqlite
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .all()
      .map((row) => (row as { name: string }).name)

    expect(new Set(tables)).toEqual(
      new Set([
        'users',
        'sessions',
        'invites',
        'recipes',
        'ingredients',
        'steps',
        'recipe_tags',
        'schema_migrations',
      ]),
    )
  })

  it('is idempotent across boots on the same data dir', async () => {
    const testApp = await createTestApp()
    open.push(testApp)

    const before = testApp.app.sqlite
      .prepare('select count(*) as count from schema_migrations')
      .get() as { count: number }

    const second = await buildApp({ config: testApp.config, logger: false })
    await second.ready()
    const after = second.sqlite
      .prepare('select count(*) as count from schema_migrations')
      .get() as { count: number }
    await second.close()

    expect(before.count).toBeGreaterThan(0)
    expect(after.count).toBe(before.count)
  })
})

describe('routing', () => {
  it('returns a JSON 404 envelope for unknown api routes', async () => {
    const testApp = await createTestApp()
    open.push(testApp)

    const response = await testApp.app.inject({ method: 'GET', url: '/api/nope' })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('not_found')
  })

  it('sets a strict CSP in production and leaves HSTS to the proxy', async () => {
    const testApp = await createTestApp({
      nodeEnv: 'production',
      cookieSecure: true,
      publicUrl: 'https://herrku.example',
      allowedOrigins: ['https://herrku.example'],
    })
    open.push(testApp)

    const response = await testApp.app.inject({ method: 'GET', url: '/api/health' })
    const csp = String(response.headers['content-security-policy'] ?? '')

    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('upgrade-insecure-requests')
    expect(response.headers['strict-transport-security']).toBeUndefined()
  })

  it('serves the SPA shell for unknown non-api GETs when a build exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'herrku-web-'))
    mkdirSync(join(dir, 'web'), { recursive: true })
    writeFileSync(join(dir, 'web', 'index.html'), '<!doctype html><title>herrku</title>')

    const testApp = await createTestApp({ webRoot: join(dir, 'web') })
    open.push(testApp)

    const response = await testApp.app.inject({ method: 'GET', url: '/recipes/pahkinaleipa' })

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('herrku')
  })
})
