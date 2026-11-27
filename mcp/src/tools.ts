import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { UNIT_TOKENS } from '@herrku/shared'
import { z } from 'zod'
import type { HerrkuClient } from './client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
  [key: string]: unknown
}

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function fail(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return { isError: true, content: [{ type: 'text', text: message }] }
}

const ingredientSchema = z.object({
  section: z.string().max(80).nullable().optional().describe('Optional component group'),
  rawText: z.string().max(500).nullable().optional().describe('Line as written, e.g. "1 1/2 cups flour"'),
  quantity: z.number().min(0).max(1_000_000).nullable().optional(),
  quantityMax: z.number().min(0).max(1_000_000).nullable().optional().describe('Upper bound for ranges'),
  unit: z.enum(UNIT_TOKENS).nullable().optional(),
  name: z.string().max(200).optional(),
  note: z.string().max(200).nullable().optional(),
})

const stepSchema = z.object({
  section: z.string().max(80).nullable().optional(),
  text: z.string().min(1).max(5000),
})

const recipeFields = {
  title: z.string().min(1).max(200).describe('Recipe title'),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().min(1).max(1000).nullable().optional(),
  prepMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  cookMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  sourceUrl: z.string().max(500).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  tags: z.array(z.string()).max(10).optional(),
  ingredients: z.array(ingredientSchema).max(200).optional(),
  steps: z.array(stepSchema).max(100).optional(),
}

export function registerHerrkuTools(server: McpServer, api: HerrkuClient): void {
  server.registerTool(
    'search_recipes',
    {
      title: 'Search recipes',
      description:
        'Search the shared recipe library by title/ingredient substring and tags. Returns summaries, not full recipes.',
      inputSchema: {
        query: z.string().optional().describe('Case-insensitive substring; at least 2 characters'),
        tag: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Tag filter; several tags must all match'),
        sort: z.enum(['recent', 'title']).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
    },
    async (input) => {
      try {
        return ok(await api.searchRecipes(input))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'get_recipe',
    {
      title: 'Get recipe',
      description: 'Fetch a full recipe by slug: ingredients, steps, tags, times and notes.',
      inputSchema: {
        slug: z.string().min(1).describe('Recipe slug, e.g. "tomato-soup"'),
      },
    },
    async ({ slug }) => {
      try {
        return ok(await api.getRecipe(slug))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'create_recipe',
    {
      title: 'Create recipe',
      description:
        'Create a recipe. Ingredients may be given as structured fields or as raw lines such as "2 cups flour"; the server parses raw lines.',
      inputSchema: recipeFields,
    },
    async (input) => {
      try {
        return ok(await api.createRecipe(input))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'update_recipe',
    {
      title: 'Update recipe',
      description:
        'Replace a recipe by slug. This is a full replace: omitted optional fields are cleared.',
      inputSchema: {
        slug: z.string().min(1),
        ...recipeFields,
      },
    },
    async ({ slug, ...input }) => {
      try {
        return ok(await api.updateRecipe(slug, input))
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description: 'List recipe tags with counts, for building a filter or browsing.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await api.listTags())
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    'build_shopping_list',
    {
      title: 'Build shopping list',
      description:
        'Merge selected recipes into one shopping list. Omit servings to use each recipe’s yield. Returns the copy-ready text and structured lines.',
      inputSchema: {
        items: z
          .array(
            z.object({
              recipeId: z.number().int().positive(),
              servings: z.number().int().min(1).max(1000).nullable().optional(),
            }),
          )
          .min(1)
          .max(100),
      },
    },
    async ({ items }) => {
      try {
        return ok(await api.shoppingList(items))
      } catch (error) {
        return fail(error)
      }
    },
  )
}
