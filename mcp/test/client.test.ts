import { describe, expect, it } from 'vitest'
import { HerrkuClient, HerrkuError } from '../src/client.js'

interface Call {
  url: string
  init: RequestInit
}

interface StubReply {
  status?: number
  body?: unknown
  emptyBody?: boolean
}

function stubFetch(handler: (url: string, init: RequestInit) => StubReply = () => ({ body: {} })) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const reply = handler(url, init)
    const body = reply.emptyBody ? '' : JSON.stringify(reply.body ?? {})
    return new Response(body, {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

function client(fetchImpl: typeof fetch, baseUrl = 'https://recipes.test'): HerrkuClient {
  return new HerrkuClient({ baseUrl, token: 'hk_test_token', fetchImpl })
}

describe('HerrkuClient', () => {
  it('sends a bearer token and builds search query parameters', async () => {
    const { calls, fetchImpl } = stubFetch(() => ({
      body: { items: [], page: 1, pageSize: 50, total: 0 },
    }))

    await client(fetchImpl).searchRecipes({
      query: 'soup',
      tag: ['leipä', 'soup'],
      sort: 'title',
      page: 2,
      pageSize: 10,
    })

    const url = new URL(calls[0]?.url ?? '')
    expect(`${url.origin}${url.pathname}`).toBe('https://recipes.test/api/recipes')
    expect(url.searchParams.get('q')).toBe('soup')
    expect(url.searchParams.getAll('tag')).toEqual(['leipä', 'soup'])
    expect(url.searchParams.get('sort')).toBe('title')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('10')

    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('authorization')).toBe('Bearer hk_test_token')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('normalizes a trailing slash on the base url', async () => {
    const { calls, fetchImpl } = stubFetch(() => ({ body: { tags: [] } }))
    await client(fetchImpl, 'https://recipes.test/').listTags()
    expect(calls[0]?.url).toBe('https://recipes.test/api/tags')
  })

  it('encodes recipe slugs in the path', async () => {
    const { calls, fetchImpl } = stubFetch(() => ({ body: { slug: 'x' } }))
    await client(fetchImpl).getRecipe('pähkinäleipä')
    expect(new URL(calls[0]?.url ?? '').pathname).toBe('/api/recipes/p%C3%A4hkin%C3%A4leip%C3%A4')
  })

  it('sends recipe bodies as JSON on create and update', async () => {
    const { calls, fetchImpl } = stubFetch(() => ({
      body: { slug: 'new-loaf' },
    }))
    const api = client(fetchImpl)
    const payload = { title: 'New Loaf', ingredients: [{ rawText: '200 g flour' }] }

    await api.createRecipe(payload)
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.url).toBe('https://recipes.test/api/recipes')
    expect(new Headers(calls[0]?.init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(payload)

    await api.updateRecipe('new-loaf', payload)
    expect(calls[1]?.init.method).toBe('PUT')
    expect(calls[1]?.url).toBe('https://recipes.test/api/recipes/new-loaf')
  })

  it('posts shopping list selections', async () => {
    const { calls, fetchImpl } = stubFetch(() => ({ body: { text: '200 g flour\n', lines: [] } }))
    const result = await client(fetchImpl).shoppingList([{ recipeId: 3, servings: 8 }])

    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.url).toBe('https://recipes.test/api/shopping-list')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      items: [{ recipeId: 3, servings: 8 }],
    })
    expect(result.text).toBe('200 g flour\n')
  })

  it('maps API errors to HerrkuError', async () => {
    const { fetchImpl } = stubFetch(() => ({
      status: 401,
      body: { error: { code: 'unauthorized', message: 'Invalid or expired API token' } },
    }))

    await expect(client(fetchImpl).listTags()).rejects.toBeInstanceOf(HerrkuError)
    await expect(client(fetchImpl).listTags()).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
      message: 'Invalid or expired API token',
    })
  })

  it('falls back to a generic message for non-JSON errors', async () => {
    const { fetchImpl } = stubFetch(() => ({ status: 500, emptyBody: true }))
    await expect(client(fetchImpl).listTags()).rejects.toMatchObject({
      status: 500,
      code: 'http_error',
    })
  })
})
