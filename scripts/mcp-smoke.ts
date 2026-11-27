/**
 * End-to-end smoke for the MCP server against a running herrku instance.
 *
 *   HERRKU_URL=http://localhost:5173 npx tsx scripts/mcp-smoke.ts
 *
 * Creates a temporary token, spawns mcp/dist/index.js over stdio, exercises the
 * tools, then deletes the recipe and revokes the token.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const baseUrl = (process.env.HERRKU_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
const username = process.env.HERRKU_USER ?? 'admin'
const password = process.env.HERRKU_PASSWORD ?? 'admin-password-123'

interface TokenResponse {
  secret: string
  token: { id: number; name: string }
}

interface RecipeResponse {
  id: number
  slug: string
  title: string
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? []
  const first = content[0]
  if (!first || first.type !== 'text') throw new Error('expected text content')
  return first.text ?? ''
}

async function main(): Promise<void> {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({ username, password }),
  })
  if (!login.ok) throw new Error(`login failed: ${login.status}`)
  const cookie = (login.headers.getSetCookie?.()[0] ?? '').split(';')[0]
  if (!cookie) throw new Error('no session cookie')

  const tokenResponse = await fetch(`${baseUrl}/api/tokens`, {
    method: 'POST',
    headers: { cookie, origin: baseUrl, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'mcp-smoke' }),
  })
  if (!tokenResponse.ok) throw new Error(`token creation failed: ${tokenResponse.status}`)
  const issued = (await tokenResponse.json()) as TokenResponse

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['mcp/dist/index.js'],
    env: {
      ...(process.env as Record<string, string>),
      HERRKU_URL: baseUrl,
      HERRKU_TOKEN: issued.secret,
    },
    stderr: 'inherit',
  })

  const client = new Client({ name: 'herrku-smoke', version: '1.0.0' })
  let createdRecipe: RecipeResponse | null = null

  try {
    await client.connect(transport)
    const tools = await client.listTools()
    console.log(`tools: ${tools.tools.map((tool) => tool.name).join(', ')}`)

    const search = JSON.parse(
      textOf(
        await client.callTool({ name: 'search_recipes', arguments: { query: 'soup' } }),
      ),
    ) as { total: number; items: Array<{ slug: string }> }
    console.log(`search "soup": total=${search.total} first=${search.items[0]?.slug}`)

    const tags = JSON.parse(
      textOf(await client.callTool({ name: 'list_tags', arguments: {} })),
    ) as { tags: Array<{ tag: string; count: number }> }
    console.log(`tags: ${tags.tags.map((entry) => `${entry.tag}:${entry.count}`).join(', ')}`)

    const created = await client.callTool({
      name: 'create_recipe',
      arguments: {
        title: 'MCP Smoke Bread',
        servings: 2,
        ingredients: [{ rawText: '1 cup flour' }, { rawText: '1 tsp salt' }],
        steps: [{ text: 'Mix and bake.' }],
      },
    })
    createdRecipe = JSON.parse(textOf(created)) as RecipeResponse
    console.log(`created: ${createdRecipe.slug} (id ${createdRecipe.id})`)

    const fetched = JSON.parse(
      textOf(
        await client.callTool({
          name: 'get_recipe',
          arguments: { slug: createdRecipe.slug },
        }),
      ),
    ) as { title: string; ingredients: Array<{ name: string; unit: string | null }> }
    console.log(
      `get_recipe: ${fetched.title}; ingredients=${fetched.ingredients
        .map((ingredient) => `${ingredient.name}/${ingredient.unit ?? '-'}`)
        .join(' ')}`,
    )

    const shopping = JSON.parse(
      textOf(
        await client.callTool({
          name: 'build_shopping_list',
          arguments: { items: [{ recipeId: createdRecipe.id, servings: 4 }] },
        }),
      ),
    ) as { text: string }
    console.log(`shopping list:\n${shopping.text.trim()}`)

    const updated = JSON.parse(
      textOf(
        await client.callTool({
          name: 'update_recipe',
          arguments: { slug: createdRecipe.slug, title: 'MCP Smoke Bread v2', servings: 4 },
        }),
      ),
    ) as { title: string }
    console.log(`updated title: ${updated.title}`)
  } finally {
    await client.close()

    if (createdRecipe) {
      await fetch(`${baseUrl}/api/recipes/${encodeURIComponent(createdRecipe.slug)}`, {
        method: 'DELETE',
        headers: { cookie, origin: baseUrl },
      })
    }
    await fetch(`${baseUrl}/api/tokens/${issued.token.id}`, {
      method: 'DELETE',
      headers: { cookie, origin: baseUrl },
    })
    console.log('cleaned up recipe and token')
  }
}

await main()
