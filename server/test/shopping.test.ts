import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { authHeaders, createTestApp, loginAs, withOrigin, type TestApp } from './helpers.js'

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

async function createRecipe(app: FastifyInstance, cookie: string, payload: Record<string, unknown>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/recipes',
    headers: authHeaders(cookie, { 'content-type': 'application/json' }),
    payload,
  })
  if (response.statusCode !== 201) throw new Error(response.body)
  return response.json()
}

const pasta = {
  title: 'Pasta',
  servings: 4,
  ingredients: [
    { name: 'flour', quantity: 200, unit: 'g' },
    { name: 'salt', note: 'to taste' },
    { name: 'garlic', quantity: 2, quantityMax: 3, unit: 'clove', section: 'For the sauce' },
  ],
  steps: [{ text: 'Cook.' }],
}

const bread = {
  title: 'Bread',
  servings: 2,
  ingredients: [
    { name: 'Flour', quantity: 300, unit: 'g' },
    { name: 'garlic', quantity: 1, quantityMax: 2, unit: 'clove', note: 'Minced' },
    { name: 'salt', quantity: 1, unit: 'tsp' },
  ],
  steps: [{ text: 'Bake.' }],
}

describe('POST /api/shopping-list', () => {
  it('merges, scales and renders a plain-text list', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    const a = await createRecipe(app, cookie, pasta)
    const b = await createRecipe(app, cookie, bread)

    const response = await app.inject({
      method: 'POST',
      url: '/api/shopping-list',
      headers: authHeaders(cookie, { 'content-type': 'application/json' }),
      payload: {
        items: [
          { recipeId: a.id, servings: 8 },
          { recipeId: b.id },
        ],
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.text).toBe(
      '700 g flour\n5–8 cloves garlic (Minced)\nsalt (to taste)\n1 tsp salt\n',
    )
    expect(body.lines).toEqual([
      { name: 'flour', unit: 'g', quantity: 700, quantityMax: null, notes: [] },
      { name: 'garlic', unit: 'clove', quantity: 5, quantityMax: 8, notes: ['Minced'] },
      { name: 'salt', unit: null, quantity: null, quantityMax: null, notes: ['to taste'] },
      { name: 'salt', unit: 'tsp', quantity: 1, quantityMax: null, notes: [] },
    ])
  })

  it('uses multiplier 1 when a recipe has no servings', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    const recipe = await createRecipe(app, cookie, {
      title: 'No yield',
      ingredients: [{ name: 'oats', quantity: 200, unit: 'g' }],
      steps: [{ text: 'Mix.' }],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/shopping-list',
      headers: authHeaders(cookie, { 'content-type': 'application/json' }),
      payload: { items: [{ recipeId: recipe.id, servings: 10 }] },
    })

    expect(response.json().lines[0]).toMatchObject({ name: 'oats', quantity: 200 })
  })

  it('rejects an empty selection with 400', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/shopping-list',
      headers: authHeaders(cookie, { 'content-type': 'application/json' }),
      payload: { items: [] },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('validation_failed')
  })

  it('returns 404 for an unknown recipe', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/shopping-list',
      headers: authHeaders(cookie, { 'content-type': 'application/json' }),
      payload: { items: [{ recipeId: 9999 }] },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('not_found')
  })

  it('requires a session', async () => {
    const { app } = await setup()

    const response = await app.inject({
      method: 'POST',
      url: '/api/shopping-list',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: { items: [{ recipeId: 1 }] },
    })

    expect(response.statusCode).toBe(401)
  })
})
