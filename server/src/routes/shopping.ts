import type { FastifyInstance } from 'fastify'
import { mergeShoppingList, renderShoppingList, shoppingListSchema, type Unit } from '@herrku/shared'
import { requireAuth } from '../auth/session.js'
import { notFound } from '../lib/errors.js'

interface RecipeRow {
  id: number
  servings: number | null
}

interface IngredientRow {
  section: string | null
  quantity: number | null
  quantity_max: number | null
  unit: string | null
  name: string
  note: string | null
}

export async function shoppingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/shopping-list', { preHandler: requireAuth }, async (request) => {
    const input = shoppingListSchema.parse(request.body)

    const selections = input.items.map((item) => {
      const recipe = app.sqlite
        .prepare('select id, servings from recipes where id = ?')
        .get(item.recipeId) as RecipeRow | undefined
      if (!recipe) throw notFound('Recipe not found')

      const ingredients = app.sqlite
        .prepare('select section, quantity, quantity_max, unit, name, note from ingredients where recipe_id = ? order by position')
        .all(recipe.id) as IngredientRow[]

      return {
        servings: item.servings ?? null,
        recipe: {
          servings: recipe.servings,
          ingredients: ingredients.map((ingredient) => ({
            section: ingredient.section,
            quantity: ingredient.quantity,
            quantityMax: ingredient.quantity_max,
            unit: ingredient.unit as Unit | null,
            name: ingredient.name,
            note: ingredient.note,
          })),
        },
      }
    })

    const lines = mergeShoppingList(selections)
    return { text: renderShoppingList(lines), lines }
  })
}
