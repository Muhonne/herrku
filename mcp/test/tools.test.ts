import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { HerrkuClient } from '../src/client.js'
import { createHerrkuMcpServer } from '../src/server.js'

interface Call {
  url: string
  init: RequestInit
}

function stubFetch(handler: (url: string, init: RequestInit) => { status?: number; body?: unknown }) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const reply = handler(url, init)
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

async function connect(fetchImpl: typeof fetch) {
  const api = new HerrkuClient({ baseUrl: 'https://recipes.test', token: 'hk_test', fetchImpl })
  const server = createHerrkuMcpServer(api)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const mcp = new Client({ name: 'test-client', version: '0.0.0' })
  await mcp.connect(clientTransport)

  return {
    mcp,
    close: async () => {
      await mcp.close()
      await server.close()
    },
  }
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? []
  const first = content[0]
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('expected a text content block')
  }
  return first.text
}

describe('herrku MCP tools', () => {
  it('advertises the thin tool surface', async () => {
    const { fetchImpl } = stubFetch(() => ({ body: {} }))
    const connection = await connect(fetchImpl)
    try {
      const { tools } = await connection.mcp.listTools()
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'build_shopping_list',
        'create_recipe',
        'get_recipe',
        'list_tags',
        'search_recipes',
        'update_recipe',
      ])
    } finally {
      await connection.close()
    }
  })

  it('searches recipes through the API', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({
      body: { items: [{ slug: 'tomato-soup', title: 'Tomato Soup' }], total: 1 },
    }))
    const connection = await connect(fetchImpl)
    try {
      const result = await connection.mcp.callTool({
        name: 'search_recipes',
        arguments: { query: 'soup' },
      })
      const payload = JSON.parse(textOf(result))
      expect(payload.total).toBe(1)
      expect(payload.items[0].slug).toBe('tomato-soup')
      expect(new URL(calls[0]?.url ?? '').searchParams.get('q')).toBe('soup')
    } finally {
      await connection.close()
    }
  })

  it('fetches a recipe by slug', async () => {
    const { fetchImpl } = stubFetch(() => ({
      body: { slug: 'tomato-soup', title: 'Tomato Soup', ingredients: [], steps: [] },
    }))
    const connection = await connect(fetchImpl)
    try {
      const result = await connection.mcp.callTool({
        name: 'get_recipe',
        arguments: { slug: 'tomato-soup' },
      })
      expect(JSON.parse(textOf(result)).title).toBe('Tomato Soup')
    } finally {
      await connection.close()
    }
  })

  it('creates and updates recipes with the supplied fields', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ body: { slug: 'agent-loaf' } }))
    const connection = await connect(fetchImpl)
    try {
      await connection.mcp.callTool({
        name: 'create_recipe',
        arguments: {
          title: 'Agent Loaf',
          servings: 4,
          tags: ['agent'],
          ingredients: [{ rawText: '200 g flour' }],
          steps: [{ text: 'Bake.' }],
        },
      })
      expect(calls[0]?.init.method).toBe('POST')
      expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
        title: 'Agent Loaf',
        servings: 4,
        tags: ['agent'],
      })

      await connection.mcp.callTool({
        name: 'update_recipe',
        arguments: { slug: 'agent-loaf', title: 'Agent Loaf v2' },
      })
      expect(calls[1]?.init.method).toBe('PUT')
      expect(calls[1]?.url).toBe('https://recipes.test/api/recipes/agent-loaf')
    } finally {
      await connection.close()
    }
  })

  it('lists tags and builds a shopping list', async () => {
    const { fetchImpl } = stubFetch((url) => {
      if (url.includes('/api/tags')) return { body: { tags: [{ tag: 'soup', count: 2 }] } }
      return { body: { text: '200 g flour\n', lines: [] } }
    })
    const connection = await connect(fetchImpl)
    try {
      const tags = JSON.parse(
        textOf(
          await connection.mcp.callTool({ name: 'list_tags', arguments: {} }),
        ),
      )
      expect(tags.tags[0]).toEqual({ tag: 'soup', count: 2 })

      const shopping = JSON.parse(
        textOf(
          await connection.mcp.callTool({
            name: 'build_shopping_list',
            arguments: { items: [{ recipeId: 1, servings: 8 }] },
          }),
        ),
      )
      expect(shopping.text).toBe('200 g flour\n')
    } finally {
      await connection.close()
    }
  })

  it('returns tool errors without breaking the session', async () => {
    const { fetchImpl } = stubFetch(() => ({
      status: 403,
      body: { error: { code: 'forbidden', message: 'Admin access required' } },
    }))
    const connection = await connect(fetchImpl)
    try {
      const result = (await connection.mcp.callTool({
        name: 'list_tags',
        arguments: {},
      })) as { isError?: boolean; content?: Array<{ type: string; text?: string }> }

      expect(result.isError).toBe(true)
      expect(result.content?.[0]?.text).toContain('Admin access required')

      const stillWorks = await connection.mcp.listTools()
      expect(stillWorks.tools.length).toBeGreaterThan(0)
    } finally {
      await connection.close()
    }
  })
})
