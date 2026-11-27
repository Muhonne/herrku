import { mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import sharp from 'sharp'
import { buildSearchText, slugify } from '@herrku/shared'
import { loadConfig } from '../server/src/config.js'
import { applyMigrations } from '../server/src/db/migrate.js'
import { openDatabase } from '../server/src/db/open.js'
import { hashPassword } from '../server/src/lib/password.js'

const isE2E = process.argv.includes('--e2e')

if (isE2E && process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed e2e data with NODE_ENV=production')
  process.exit(1)
}
if (process.env.NODE_ENV === 'production') {
  console.warn('seed: overriding NODE_ENV=production for a local seed run')
  process.env.NODE_ENV = 'development'
}
process.env.DATA_DIR ??= './.data'

const config = loadConfig()
const { sqlite } = openDatabase(join(config.dataDir, 'db.sqlite'))
applyMigrations(sqlite, config.migrationsDir)

const ADMIN_USER = process.env.ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin-password-123'
const MEMBER_USER = 'friend'
const MEMBER_PASSWORD = 'member-password-1'

function now(): string {
  return new Date().toISOString()
}

async function ensureUser(
  username: string,
  password: string,
  role: 'admin' | 'member',
  displayName = username,
): Promise<number> {
  const existing = sqlite.prepare('select id from users where username = ?').get(username) as
    | { id: number }
    | undefined
  if (existing) return existing.id

  const timestamp = now()
  const result = sqlite
    .prepare(
      `insert into users (username, display_name, password_hash, role, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?)`,
    )
    .run(username.toLowerCase(), displayName, await hashPassword(password), role, timestamp, timestamp)
  return Number(result.lastInsertRowid)
}

interface SeedIngredient {
  section?: string | null
  quantity?: number | null
  quantityMax?: number | null
  unit?: string | null
  name: string
  note?: string | null
  rawText?: string | null
}

interface SeedRecipe {
  title: string
  description?: string | null
  servings?: number | null
  prepMinutes?: number | null
  cookMinutes?: number | null
  tags: string[]
  ingredients: SeedIngredient[]
  steps: Array<{ section?: string | null; text: string }>
  notes?: string | null
  sourceUrl?: string | null
  withImage?: boolean
}

function nextSlug(title: string): string {
  const base = slugify(title)
  let candidate = base
  let suffix = 2
  while (sqlite.prepare('select 1 from recipes where slug = ?').get(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

async function seedImage(recipeId: number): Promise<{ imagePath: string; thumbPath: string }> {
  const directory = join(config.dataDir, 'uploads', String(recipeId))
  mkdirSync(directory, { recursive: true })
  const fullPath = join(directory, 'seed.webp')
  const thumbPath = join(directory, 'seed-thumb.webp')
  await sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 16, g: 148, b: 110 } },
  })
    .webp({ quality: 82 })
    .toFile(fullPath)
  await sharp({
    create: { width: 400, height: 267, channels: 3, background: { r: 16, g: 148, b: 110 } },
  })
    .webp({ quality: 82 })
    .toFile(thumbPath)
  return {
    imagePath: relative(config.dataDir, fullPath),
    thumbPath: relative(config.dataDir, thumbPath),
  }
}

async function insertRecipe(userId: number, recipe: SeedRecipe): Promise<number> {
  const timestamp = now()
  const slug = nextSlug(recipe.title)
  const tags = [...recipe.tags].map((tag) => tag.toLowerCase()).sort()
  const searchText = buildSearchText({
    title: recipe.title,
    ingredientNames: recipe.ingredients.map((ingredient) => ingredient.name),
    tags,
  })

  const result = sqlite
    .prepare(
      `insert into recipes
        (slug, title, description, servings, prep_minutes, cook_minutes, source_url, notes,
         search_text, created_by, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      slug,
      recipe.title,
      recipe.description ?? null,
      recipe.servings ?? null,
      recipe.prepMinutes ?? null,
      recipe.cookMinutes ?? null,
      recipe.sourceUrl ?? null,
      recipe.notes ?? null,
      searchText,
      userId,
      timestamp,
      timestamp,
    )

  const recipeId = Number(result.lastInsertRowid)

  const insertIngredient = sqlite.prepare(
    `insert into ingredients
      (recipe_id, position, section, quantity, quantity_max, unit, name, note, raw_text)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  recipe.ingredients.forEach((ingredient, position) => {
    const quantity = ingredient.quantity ?? null
    const quantityMax = ingredient.quantityMax ?? null
    const unit = ingredient.unit ?? null
    const rawText =
      ingredient.rawText ??
      [quantity ?? '', unit ?? '', ingredient.name].filter(Boolean).join(' ')
    insertIngredient.run(
      recipeId,
      position,
      ingredient.section ?? null,
      quantity,
      quantityMax,
      unit,
      ingredient.name,
      ingredient.note ?? null,
      rawText,
    )
  })

  const insertStep = sqlite.prepare(
    'insert into steps (recipe_id, position, section, text) values (?, ?, ?, ?)',
  )
  recipe.steps.forEach((step, position) => {
    insertStep.run(recipeId, position, step.section ?? null, step.text)
  })

  const insertTag = sqlite.prepare('insert into recipe_tags (recipe_id, tag) values (?, ?)')
  for (const tag of tags) insertTag.run(recipeId, tag)

  if (recipe.withImage) {
    const stored = await seedImage(recipeId)
    sqlite
      .prepare('update recipes set image_path = ?, image_thumb_path = ? where id = ?')
      .run(stored.imagePath, stored.thumbPath, recipeId)
  }

  return recipeId
}

const adminId = await ensureUser(ADMIN_USER, ADMIN_PASSWORD, 'admin', 'Admin')
const friendId = await ensureUser(MEMBER_USER, MEMBER_PASSWORD, 'member', 'Friend')

const recipeCount = (sqlite.prepare('select count(*) as count from recipes').get() as { count: number })
  .count

if (recipeCount === 0) {
  await insertRecipe(adminId, {
    title: 'Pähkinäleipä',
    description: 'A quick weekday nut loaf.',
    servings: 8,
    prepMinutes: 15,
    cookMinutes: 45,
    tags: ['leipä', 'baking'],
    notes: 'Freezes well.',
    ingredients: [
      { quantity: 1.5, unit: 'cup', name: 'flour', rawText: '1 1/2 cups flour' },
      { quantity: 2, quantityMax: 3, unit: 'clove', name: 'garlic', note: 'minced' },
      { quantity: null, name: 'salt', note: 'to taste' },
    ],
    steps: [
      { text: 'Mix everything into a dough.' },
      { text: 'Bake for 45 minutes.' },
    ],
  })

  await insertRecipe(adminId, {
    title: 'Tomato Soup',
    description: 'Simple, bright weeknight soup.',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ['soup'],
    withImage: true,
    ingredients: [
      { quantity: 400, unit: 'g', name: 'canned tomatoes' },
      { quantity: 1, unit: 'piece', name: 'onion' },
      { quantity: 2, unit: 'cup', name: 'stock' },
    ],
    steps: [{ text: 'Simmer everything for 30 minutes.' }, { text: 'Blend and season.' }],
  })

  await insertRecipe(friendId, {
    title: 'Ruisleipä',
    description: 'Dark rye bread.',
    servings: 6,
    tags: ['leipä'],
    ingredients: [
      { quantity: 2, unit: 'cup', name: 'rye flour' },
      { quantity: 1, unit: 'cup', name: 'water' },
    ],
    steps: [{ text: 'Knead, prove, bake.' }],
  })
}

sqlite.close()

console.log('Seed complete')
console.log(`  admin:  ${ADMIN_USER} / ${ADMIN_PASSWORD}`)
console.log(`  member: ${MEMBER_USER} / ${MEMBER_PASSWORD}`)
console.log(`  data:   ${config.dataDir}`)
