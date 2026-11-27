import type { FastifyInstance } from 'fastify'
import type { IngredientInput, RecipeInput } from '@herrku/shared'
import {
  buildSearchText,
  formatQuantity,
  parseIngredient,
  recipeInputSchema,
  slugify,
  unitLabel,
  type Unit,
} from '@herrku/shared'
import { requireAuth, type SessionUser } from '../auth/session.js'
import { forbidden, notFound } from '../lib/errors.js'
import { deleteStoredImages } from '../lib/images.js'

interface RecipeRow {
  id: number
  slug: string
  title: string
  description: string | null
  servings: number | null
  prep_minutes: number | null
  cook_minutes: number | null
  source_url: string | null
  notes: string | null
  search_text: string
  created_by: number
  created_at: string
  updated_at: string
  image_path: string | null
  image_thumb_path: string | null
}

interface IngredientRow {
  id: number
  recipe_id: number
  position: number
  section: string | null
  quantity: number | null
  quantity_max: number | null
  unit: string | null
  name: string
  note: string | null
  raw_text: string | null
}

interface StepRow {
  id: number
  recipe_id: number
  position: number
  section: string | null
  text: string
}

interface NormalizedIngredient {
  section: string | null
  quantity: number | null
  quantityMax: number | null
  unit: Unit | null
  name: string
  note: string | null
  rawText: string
}

function synthesizeRawText(ingredient: IngredientInput): string {
  const quantity = formatQuantity(ingredient.quantity, ingredient.quantityMax)
  const unit = ingredient.unit ? unitLabel(ingredient.unit, ingredient.quantityMax ?? ingredient.quantity) : ''
  const parts = [quantity, unit, ingredient.name].filter((part) => part.length > 0)
  const base = parts.join(' ')
  return ingredient.note ? `${base}, ${ingredient.note}` : base
}

function normalizeIngredient(input: IngredientInput): NormalizedIngredient {
  if (!input.name && input.rawText) {
    const parsed = parseIngredient(input.rawText)
    return {
      section: input.section,
      quantity: parsed.quantity,
      quantityMax: parsed.quantityMax,
      unit: parsed.unit,
      name: parsed.name || input.rawText,
      note: parsed.note,
      rawText: input.rawText,
    }
  }

  return {
    section: input.section,
    quantity: input.quantity,
    quantityMax: input.quantityMax,
    unit: input.unit,
    name: input.name,
    note: input.note,
    rawText: input.rawText ?? synthesizeRawText(input),
  }
}

function totalMinutes(prep: number | null, cook: number | null): number | null {
  if (prep === null && cook === null) return null
  return (prep ?? 0) + (cook ?? 0)
}

function uniqueSlug(app: FastifyInstance, title: string): string {
  const base = slugify(title)
  let candidate = base
  let suffix = 2
  const exists = app.sqlite.prepare('select 1 from recipes where slug = ?')
  while (exists.get(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function toDocument(app: FastifyInstance, row: RecipeRow) {
  const ingredientRows = app.sqlite
    .prepare('select * from ingredients where recipe_id = ? order by position')
    .all(row.id) as IngredientRow[]
  const stepRows = app.sqlite
    .prepare('select * from steps where recipe_id = ? order by position')
    .all(row.id) as StepRow[]
  const tags = (
    app.sqlite.prepare('select tag from recipe_tags where recipe_id = ? order by tag').all(row.id) as {
      tag: string
    }[]
  ).map((item) => item.tag)
  const creator = app.sqlite
    .prepare('select id, username, display_name from users where id = ?')
    .get(row.created_by) as { id: number; username: string; display_name: string | null } | undefined

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    totalMinutes: totalMinutes(row.prep_minutes, row.cook_minutes),
    sourceUrl: row.source_url,
    notes: row.notes,
    tags,
    ingredients: ingredientRows.map((ingredient) => ({
      section: ingredient.section,
      quantity: ingredient.quantity,
      quantityMax: ingredient.quantity_max,
      unit: ingredient.unit,
      name: ingredient.name,
      note: ingredient.note,
      rawText: ingredient.raw_text,
    })),
    steps: stepRows.map((step) => ({ section: step.section, text: step.text })),
    createdBy: {
      id: creator?.id ?? row.created_by,
      displayName: creator?.display_name ?? creator?.username ?? 'unknown',
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    image: row.image_path
      ? {
          fullUrl: `/api/recipes/${row.slug}/image?variant=full`,
          thumbUrl: `/api/recipes/${row.slug}/image?variant=thumb`,
        }
      : null,
  }
}

function findRecipeRow(app: FastifyInstance, slug: string): RecipeRow | undefined {
  return app.sqlite.prepare('select * from recipes where slug = ?').get(slug) as RecipeRow | undefined
}

function assertCanEdit(user: SessionUser, row: RecipeRow): void {
  if (row.created_by !== user.id && user.role !== 'admin') {
    throw forbidden('Only the creator or an admin can change this recipe')
  }
}

function searchParams(query: Record<string, unknown>) {
  const rawQuery = typeof query.q === 'string' ? query.q.trim() : ''
  const rawTags = Array.isArray(query.tag)
    ? query.tag.filter((tag): tag is string => typeof tag === 'string')
    : typeof query.tag === 'string'
      ? [query.tag]
      : []

  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(String(query.pageSize ?? '50'), 10) || 50),
  )
  const sort = query.sort === 'title' ? 'title' : 'recent'

  return { rawQuery, rawTags, page, pageSize, sort }
}

export async function recipeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/recipes', { preHandler: requireAuth }, async (request) => {
    const { rawQuery, rawTags, page, pageSize, sort } = searchParams(
      request.query as Record<string, unknown>,
    )

    const conditions: string[] = []
    const params: Array<string | number> = []

    if (rawQuery.length >= 2) {
      conditions.push("r.search_text like ? escape '\\'")
      params.push(`%${escapeLike(rawQuery.toLowerCase())}%`)
    }

    for (const tag of rawTags) {
      conditions.push(
        'exists (select 1 from recipe_tags t where t.recipe_id = r.id and t.tag = ?)',
      )
      params.push(tag.toLowerCase())
    }

    const whereSql = conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''
    const orderSql =
      sort === 'title'
        ? 'order by r.title collate nocase asc, r.id asc'
        : 'order by r.updated_at desc, r.id desc'

    const total = (
      app.sqlite
        .prepare(`select count(*) as count from recipes r ${whereSql}`)
        .get(...params) as { count: number }
    ).count

    const rows = app.sqlite
      .prepare(`select r.* from recipes r ${whereSql} ${orderSql} limit ? offset ?`)
      .all(...params, pageSize, (page - 1) * pageSize) as RecipeRow[]

    const tagsByRecipe = new Map<number, string[]>()
    if (rows.length > 0) {
      const placeholders = rows.map(() => '?').join(', ')
      const tagRows = app.sqlite
        .prepare(
          `select recipe_id, tag from recipe_tags where recipe_id in (${placeholders}) order by tag`,
        )
        .all(...rows.map((row) => row.id)) as { recipe_id: number; tag: string }[]
      for (const tagRow of tagRows) {
        const existing = tagsByRecipe.get(tagRow.recipe_id) ?? []
        existing.push(tagRow.tag)
        tagsByRecipe.set(tagRow.recipe_id, existing)
      }
    }

    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        tags: tagsByRecipe.get(row.id) ?? [],
        servings: row.servings,
        totalMinutes: totalMinutes(row.prep_minutes, row.cook_minutes),
        hasImage: row.image_path !== null,
        thumbUrl: row.image_path ? `/api/recipes/${row.slug}/image?variant=thumb` : null,
        updatedAt: row.updated_at,
      })),
      page,
      pageSize,
      total,
    }
  })

  app.post('/api/recipes', { preHandler: requireAuth }, async (request, reply) => {
    const input: RecipeInput = recipeInputSchema.parse(request.body)
    const user = request.user as SessionUser
    const now = new Date().toISOString()

    const ingredients = input.ingredients.map(normalizeIngredient)
    const tags = [...input.tags].sort()
    const searchText = buildSearchText({
      title: input.title,
      ingredientNames: ingredients.map((ingredient) => ingredient.name),
      tags,
    })
    const slug = uniqueSlug(app, input.title)

    await app.db.transaction().execute(async (trx) => {
      const recipe = await trx
        .insertInto('recipes')
        .values({
          slug,
          title: input.title,
          description: input.description,
          servings: input.servings,
          prep_minutes: input.prepMinutes,
          cook_minutes: input.cookMinutes,
          source_url: input.sourceUrl,
          notes: input.notes,
          search_text: searchText,
          created_by: user.id,
          created_at: now,
          updated_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

      if (ingredients.length > 0) {
        await trx
          .insertInto('ingredients')
          .values(
            ingredients.map((ingredient, position) => ({
              recipe_id: recipe.id,
              position,
              section: ingredient.section,
              quantity: ingredient.quantity,
              quantity_max: ingredient.quantityMax,
              unit: ingredient.unit,
              name: ingredient.name,
              note: ingredient.note,
              raw_text: ingredient.rawText,
            })),
          )
          .execute()
      }

      if (input.steps.length > 0) {
        await trx
          .insertInto('steps')
          .values(
            input.steps.map((step, position) => ({
              recipe_id: recipe.id,
              position,
              section: step.section,
              text: step.text,
            })),
          )
          .execute()
      }

      if (tags.length > 0) {
        await trx
          .insertInto('recipe_tags')
          .values(tags.map((tag) => ({ recipe_id: recipe.id, tag })))
          .execute()
      }
    })

    const row = findRecipeRow(app, slug)
    if (!row) throw new Error('Recipe disappeared after insert')
    return reply.code(201).send(toDocument(app, row))
  })

  app.get('/api/recipes/:slug', { preHandler: requireAuth }, async (request) => {
    const { slug } = request.params as { slug: string }
    const row = findRecipeRow(app, slug)
    if (!row) throw notFound('Recipe not found')
    return toDocument(app, row)
  })

  app.put('/api/recipes/:slug', { preHandler: requireAuth }, async (request) => {
    const { slug } = request.params as { slug: string }
    const row = findRecipeRow(app, slug)
    if (!row) throw notFound('Recipe not found')
    assertCanEdit(request.user as SessionUser, row)

    const input: RecipeInput = recipeInputSchema.parse(request.body)
    const now = new Date().toISOString()
    const ingredients = input.ingredients.map(normalizeIngredient)
    const tags = [...input.tags].sort()
    const searchText = buildSearchText({
      title: input.title,
      ingredientNames: ingredients.map((ingredient) => ingredient.name),
      tags,
    })

    await app.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('recipes')
        .set({
          title: input.title,
          description: input.description,
          servings: input.servings,
          prep_minutes: input.prepMinutes,
          cook_minutes: input.cookMinutes,
          source_url: input.sourceUrl,
          notes: input.notes,
          search_text: searchText,
          updated_at: now,
        })
        .where('id', '=', row.id)
        .execute()

      await trx.deleteFrom('ingredients').where('recipe_id', '=', row.id).execute()
      await trx.deleteFrom('steps').where('recipe_id', '=', row.id).execute()
      await trx.deleteFrom('recipe_tags').where('recipe_id', '=', row.id).execute()

      if (ingredients.length > 0) {
        await trx
          .insertInto('ingredients')
          .values(
            ingredients.map((ingredient, position) => ({
              recipe_id: row.id,
              position,
              section: ingredient.section,
              quantity: ingredient.quantity,
              quantity_max: ingredient.quantityMax,
              unit: ingredient.unit,
              name: ingredient.name,
              note: ingredient.note,
              raw_text: ingredient.rawText,
            })),
          )
          .execute()
      }

      if (input.steps.length > 0) {
        await trx
          .insertInto('steps')
          .values(
            input.steps.map((step, position) => ({
              recipe_id: row.id,
              position,
              section: step.section,
              text: step.text,
            })),
          )
          .execute()
      }

      if (tags.length > 0) {
        await trx
          .insertInto('recipe_tags')
          .values(tags.map((tag) => ({ recipe_id: row.id, tag })))
          .execute()
      }
    })

    return toDocument(app, findRecipeRow(app, slug) as RecipeRow)
  })

  app.delete('/api/recipes/:slug', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const row = findRecipeRow(app, slug)
    if (!row) throw notFound('Recipe not found')
    assertCanEdit(request.user as SessionUser, row)

    await app.db.deleteFrom('recipes').where('id', '=', row.id).execute()
    deleteStoredImages(app.config.dataDir, [row.image_path, row.image_thumb_path])
    return reply.code(204).send()
  })
}
