import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
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

const sample = (overrides: Record<string, unknown> = {}) => ({
  title: 'Pähkinäleipä',
  description: 'Quick weekday loaf',
  servings: 8,
  prepMinutes: 15,
  cookMinutes: 45,
  sourceUrl: null,
  notes: 'Freezes well.',
  tags: ['Leipä', 'baking'],
  ingredients: [
    {
      section: null,
      rawText: '150 g flour',
      quantity: 150,
      quantityMax: null,
      unit: 'g',
      name: 'flour',
      note: null,
    },
    {
      section: 'For the topping',
      rawText: '2–3 cloves garlic, minced',
      quantity: 2,
      quantityMax: 3,
      unit: 'clove',
      name: 'garlic',
      note: 'minced',
    },
  ],
  steps: [
    { section: null, text: 'Mix everything.' },
    { section: 'For the topping', text: 'Scatter the garlic over the dough.' },
  ],
  ...overrides,
})

async function createRecipe(app: FastifyInstance, cookie: string, overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/recipes',
    headers: authHeaders(cookie, { 'content-type': 'application/json' }),
    payload: sample(overrides),
  })
}

describe('recipe create', () => {
  it('creates a recipe and returns the full document', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const response = await createRecipe(app, cookie)

    expect(response.statusCode).toBe(201)
    const recipe = response.json()
    expect(recipe).toMatchObject({
      slug: 'pahkinaleipa',
      title: 'Pähkinäleipä',
      servings: 8,
      totalMinutes: 60,
      image: null,
    })
    expect(recipe.tags).toEqual(['baking', 'leipä'])
    expect(recipe.ingredients).toHaveLength(2)
    expect(recipe.ingredients[1]).toMatchObject({
      section: 'For the topping',
      quantity: 2,
      quantityMax: 3,
      unit: 'clove',
      name: 'garlic',
      note: 'minced',
    })
    expect(recipe.steps).toHaveLength(2)
    expect(recipe.createdBy.displayName).toBe('admin')
  })

  it('parses rawText when only a raw line is supplied', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const response = await createRecipe(app, cookie, {
      ingredients: [{ rawText: '2–3 cloves garlic, minced' }],
      steps: [{ text: 'Cook.' }],
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().ingredients[0]).toMatchObject({
      quantity: 2,
      quantityMax: 3,
      unit: 'clove',
      name: 'garlic',
      note: 'minced',
    })
  })

  it('suffixes colliding slugs', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    await createRecipe(app, cookie)
    const second = await createRecipe(app, cookie)

    expect(second.json().slug).toBe('pahkinaleipa-2')
  })

  it('rejects invalid input with field details', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: authHeaders(cookie, { 'content-type': 'application/json' }),
      payload: { title: '', ingredients: [], steps: [], tags: [] },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('validation_failed')
    expect(response.json().error.details.length).toBeGreaterThan(0)
  })

  it.each([
    ['servings out of range', { servings: 0 }],
    ['too many tags', { tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) }],
    [
      'quantityMax below quantity',
      {
        ingredients: [
          { name: 'flour', quantity: 2, quantityMax: 1, unit: 'g' },
        ],
      },
    ],
    ['unknown unit', { ingredients: [{ name: 'flour', quantity: 1, unit: 'scoop' }] }],
    ['non-http source url', { sourceUrl: 'ftp://example.com/recipe' }],
  ])('rejects %s', async (_label, overrides) => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const response = await createRecipe(app, cookie, overrides)

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('validation_failed')
  })

  it('requires a session', async () => {
    const { app } = await setup()

    const response = await app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: withOrigin({ 'content-type': 'application/json' }),
      payload: sample(),
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('recipe read', () => {
  it('returns a recipe by slug', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await createRecipe(app, cookie)

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(cookie),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().title).toBe('Pähkinäleipä')
    expect(response.json().ingredients).toHaveLength(2)
  })

  it('returns 404 for an unknown slug', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes/does-not-exist',
      headers: authHeaders(cookie),
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('not_found')
  })

  it('requires a session to read', async () => {
    const { app } = await setup()
    const response = await app.inject({ method: 'GET', url: '/api/recipes' })
    expect(response.statusCode).toBe(401)
  })

  it('lists recipes without nested ingredients and with thumb metadata', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await createRecipe(app, cookie)

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: authHeaders(cookie),
    })

    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.items[0]).toMatchObject({
      slug: 'pahkinaleipa',
      hasImage: false,
      thumbUrl: null,
      totalMinutes: 60,
    })
    expect(body.items[0].ingredients).toBeUndefined()
    expect(body.items[0].tags).toEqual(['baking', 'leipä'])
  })
})

describe('search', () => {
  async function seedSearchFixtures(app: FastifyInstance, cookie: string) {
    await createRecipe(app, cookie)
    await createRecipe(app, cookie, {
      title: 'Ruisleipä',
      tags: ['leipä'],
      ingredients: [{ name: 'rye flour', quantity: 300, unit: 'g' }],
      steps: [{ text: 'Bake.' }],
    })
    await createRecipe(app, cookie, {
      title: '100% Rye Crackers',
      tags: ['snack'],
      ingredients: [{ name: 'rye flour', quantity: 150, unit: 'g' }],
      steps: [{ text: 'Bake.' }],
    })
    await createRecipe(app, cookie, {
      title: 'Tomato Soup',
      tags: ['soup'],
      ingredients: [{ name: 'tomatoes', quantity: 4, unit: 'piece' }],
      steps: [{ text: 'Simmer.' }],
    })
  }

  it('matches a finnish title case-insensitively', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await seedSearchFixtures(app, cookie)

    for (const q of ['pähkinä', 'PÄHKINÄ', 'Pähkinä']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/recipes?q=${encodeURIComponent(q)}`,
        headers: authHeaders(cookie),
      })
      expect(response.json().items.map((item: { slug: string }) => item.slug)).toContain(
        'pahkinaleipa',
      )
    }
  })

  it('matches ingredient names', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await seedSearchFixtures(app, cookie)

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes?q=tomatoes',
      headers: authHeaders(cookie),
    })

    expect(response.json().items.map((item: { slug: string }) => item.slug)).toEqual([
      'tomato-soup',
    ])
  })

  it('does not treat wildcards in the query as sql wildcards', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await seedSearchFixtures(app, cookie)

    const percent = await app.inject({
      method: 'GET',
      url: '/api/recipes?q=100%25',
      headers: authHeaders(cookie),
    })
    expect(percent.json().total).toBe(1)
    expect(percent.json().items[0].slug).toBe('100-rye-crackers')

    const bare = await app.inject({
      method: 'GET',
      url: '/api/recipes?q=%25_',
      headers: authHeaders(cookie),
    })
    expect(bare.json().total).toBe(0)
  })

  it('ignores queries shorter than two characters', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await seedSearchFixtures(app, cookie)

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes?q=t',
      headers: authHeaders(cookie),
    })
    expect(response.json().total).toBe(4)
  })

  it('filters by tag and ANDs repeated tags', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await seedSearchFixtures(app, cookie)

    const one = await app.inject({
      method: 'GET',
      url: '/api/recipes?tag=leip%C3%A4',
      headers: authHeaders(cookie),
    })
    expect(one.json().total).toBe(2)

    const both = await app.inject({
      method: 'GET',
      url: '/api/recipes?tag=leip%C3%A4&tag=baking',
      headers: authHeaders(cookie),
    })
    expect(both.json().total).toBe(1)
    expect(both.json().items[0].slug).toBe('pahkinaleipa')
  })

  it('sorts and paginates', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await seedSearchFixtures(app, cookie)

    const byTitle = await app.inject({
      method: 'GET',
      url: '/api/recipes?sort=title&pageSize=2&page=1',
      headers: authHeaders(cookie),
    })
    expect(byTitle.json().items.map((item: { title: string }) => item.title)).toEqual([
      '100% Rye Crackers',
      'Pähkinäleipä',
    ])
    expect(byTitle.json().total).toBe(4)
    expect(byTitle.json().pageSize).toBe(2)

    const page2 = await app.inject({
      method: 'GET',
      url: '/api/recipes?sort=title&pageSize=2&page=2',
      headers: authHeaders(cookie),
    })
    expect(page2.json().items.map((item: { title: string }) => item.title)).toEqual([
      'Ruisleipä',
      'Tomato Soup',
    ])
  })

  it('clamps pageSize to the maximum', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await seedSearchFixtures(app, cookie)

    const response = await app.inject({
      method: 'GET',
      url: '/api/recipes?pageSize=500',
      headers: authHeaders(cookie),
    })
    expect(response.json().pageSize).toBe(100)
  })
})

describe('tags', () => {
  it('returns distinct tags with counts, sorted', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await createRecipe(app, cookie)
    await createRecipe(app, cookie, {
      title: 'Other',
      tags: ['leipä'],
      ingredients: [{ name: 'flour', quantity: 1, unit: 'g' }],
      steps: [{ text: 'Bake.' }],
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/tags',
      headers: authHeaders(cookie),
    })

    expect(response.json().tags).toEqual([
      { tag: 'baking', count: 1 },
      { tag: 'leipä', count: 2 },
    ])
  })
})

describe('recipe update and delete', () => {
  it('replaces nested data and keeps the slug stable', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    const created = (await createRecipe(app, cookie)).json()

    const response = await app.inject({
      method: 'PUT',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(cookie, { 'content-type': 'application/json' }),
      payload: {
        title: 'Täysin uusi nimi',
        servings: 4,
        tags: ['uusi'],
        ingredients: [{ name: 'milk', quantity: 500, unit: 'ml' }],
        steps: [{ text: 'Boil.' }],
      },
    })

    expect(response.statusCode).toBe(200)
    const updated = response.json()
    expect(updated.slug).toBe('pahkinaleipa')
    expect(updated.title).toBe('Täysin uusi nimi')
    expect(updated.tags).toEqual(['uusi'])
    expect(updated.ingredients).toHaveLength(1)
    expect(updated.steps).toHaveLength(1)
    expect(updated.createdBy.id).toBe(created.createdBy.id)

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/recipes/pahkinaleipa?q=x',
      headers: authHeaders(cookie),
    })
    expect(fetched.json().title).toBe('Täysin uusi nimi')
  })

  it('lets the creator delete', async () => {
    const { app } = await setup()
    const cookie = await loginAs(app)
    await createRecipe(app, cookie)

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(cookie),
    })
    expect(response.statusCode).toBe(204)

    const fetched = await app.inject({
      method: 'GET',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(cookie),
    })
    expect(fetched.statusCode).toBe(404)
  })

  it('forbids other members from editing or deleting', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    await createRecipe(app, admin)
    const member = await createMember(app, admin, 'friend')

    const other = await app.inject({
      method: 'GET',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(member),
    })
    expect(other.statusCode).toBe(200)

    const update = await app.inject({
      method: 'PUT',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(member, { 'content-type': 'application/json' }),
      payload: { title: 'Hijacked', ingredients: [], steps: [], tags: [] },
    })
    expect(update.statusCode).toBe(403)
    expect(update.json().error.code).toBe('forbidden')

    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(member),
    })
    expect(remove.statusCode).toBe(403)
  })

  it('lets an admin edit and delete a member recipe', async () => {
    const { app } = await setup()
    const admin = await loginAs(app)
    const member = await createMember(app, admin, 'friend')
    await createRecipe(app, member)

    const update = await app.inject({
      method: 'PUT',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(admin, { 'content-type': 'application/json' }),
      payload: { title: 'Admin edit', ingredients: [], steps: [], tags: [] },
    })
    expect(update.statusCode).toBe(200)

    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/recipes/pahkinaleipa',
      headers: authHeaders(admin),
    })
    expect(remove.statusCode).toBe(204)
  })
})
