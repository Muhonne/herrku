import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authHeaders,
  createMember,
  createTestApp,
  loginAs,
  multipartPayload,
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

async function jpeg(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .toBuffer()
}

async function createRecipe(app: FastifyInstance, cookie: string, title = 'Photo Dish') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/recipes',
    headers: authHeaders(cookie, { 'content-type': 'application/json' }),
    payload: { title, ingredients: [], steps: [{ text: 'Cook.' }] },
  })
  return response.json()
}

async function upload(
  app: FastifyInstance,
  cookie: string,
  slug: string,
  file: Buffer,
  options: { filename?: string; contentType?: string } = {},
) {
  const { payload, contentType } = multipartPayload(file, {
    filename: options.filename ?? 'photo.jpg',
    contentType: options.contentType ?? 'image/jpeg',
  })
  return app.inject({
    method: 'POST',
    url: `/api/recipes/${slug}/image`,
    headers: authHeaders(cookie, { 'content-type': contentType }),
    payload,
  })
}

function imageDir(testApp: TestApp, recipeId: number): string {
  return join(testApp.dir, 'uploads', String(recipeId))
}

describe('image upload', () => {
  it('stores a full image and a thumbnail and returns urls', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, cookie)

    const response = await upload(testApp.app, cookie, recipe.slug, await jpeg())

    expect(response.statusCode).toBe(200)
    expect(response.json().image).toEqual({
      fullUrl: `/api/recipes/${recipe.slug}/image?variant=full`,
      thumbUrl: `/api/recipes/${recipe.slug}/image?variant=thumb`,
    })

    const files = readdirSync(imageDir(testApp, recipe.id)).filter((file) => file.endsWith('.webp'))
    expect(files).toHaveLength(2)
    expect(files.some((file) => file.includes('-thumb'))).toBe(true)
  })

  it('serves the image through the api with private caching', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, cookie)
    await upload(testApp.app, cookie, recipe.slug, await jpeg())

    const response = await testApp.app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.slug}/image?variant=full`,
      headers: authHeaders(cookie),
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/webp')
    expect(String(response.headers['cache-control'])).toContain('private')
    expect(response.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF')

    const thumb = await testApp.app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.slug}/image?variant=thumb`,
      headers: authHeaders(cookie),
    })
    expect(thumb.statusCode).toBe(200)
  })

  it('lets any signed-in user read an image but requires a session', async () => {
    const testApp = await setup()
    const admin = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, admin)
    await upload(testApp.app, admin, recipe.slug, await jpeg())
    const member = await createMember(testApp.app, admin, 'friend')

    const anonymous = await testApp.app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.slug}/image`,
    })
    expect(anonymous.statusCode).toBe(401)

    const allowed = await testApp.app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.slug}/image`,
      headers: authHeaders(member),
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('marks hasImage and thumbUrl on the list', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, cookie)
    await upload(testApp.app, cookie, recipe.slug, await jpeg())

    const list = await testApp.app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: authHeaders(cookie),
    })

    expect(list.json().items[0]).toMatchObject({
      hasImage: true,
      thumbUrl: `/api/recipes/${recipe.slug}/image?variant=thumb`,
    })
  })

  it('forbids a non-owner member from uploading', async () => {
    const testApp = await setup()
    const admin = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, admin)
    const member = await createMember(testApp.app, admin, 'friend')

    const response = await upload(testApp.app, member, recipe.slug, await jpeg())

    expect(response.statusCode).toBe(403)
  })

  it('rejects non-image bytes with 415', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, cookie)

    const response = await upload(testApp.app, cookie, recipe.slug, Buffer.from('this is not an image'))

    expect(response.statusCode).toBe(415)
    expect(response.json().error.code).toBe('unsupported_media_type')
  })

  it('rejects files over the configured limit with 413', async () => {
    const testApp = await setup({ maxUploadMb: 1 })
    const cookie = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, cookie)

    const big = Buffer.alloc(2 * 1024 * 1024, 0x41)
    big[0] = 0xff
    big[1] = 0xd8
    big[2] = 0xff

    const response = await upload(testApp.app, cookie, recipe.slug, big)

    expect(response.statusCode).toBe(413)
  })

  it('replaces the previous files on re-upload', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, cookie)

    await upload(testApp.app, cookie, recipe.slug, await jpeg(64, 48))
    const before = readdirSync(imageDir(testApp, recipe.id))
    await upload(testApp.app, cookie, recipe.slug, await jpeg(32, 32))
    const after = readdirSync(imageDir(testApp, recipe.id)).filter((file) => file.endsWith('.webp'))

    expect(after).toHaveLength(2)
    const removed = before.filter((file) => file.endsWith('.webp') && !after.includes(file))
    expect(removed.length).toBeGreaterThan(0)
    for (const file of removed) {
      expect(existsSync(join(imageDir(testApp, recipe.id), file))).toBe(false)
    }
  })

  it('deletes image files when the recipe is deleted', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, cookie)
    await upload(testApp.app, cookie, recipe.slug, await jpeg())
    const dir = imageDir(testApp, recipe.id)

    await testApp.app.inject({
      method: 'DELETE',
      url: `/api/recipes/${recipe.slug}`,
      headers: authHeaders(cookie),
    })

    const remaining = existsSync(dir)
      ? readdirSync(dir).filter((file) => file.endsWith('.webp'))
      : []
    expect(remaining).toHaveLength(0)
  })

  it('returns 404 when a recipe has no image', async () => {
    const testApp = await setup()
    const cookie = await loginAs(testApp.app)
    const recipe = await createRecipe(testApp.app, cookie)

    const response = await testApp.app.inject({
      method: 'GET',
      url: `/api/recipes/${recipe.slug}/image`,
      headers: authHeaders(cookie),
    })

    expect(response.statusCode).toBe(404)
  })
})
