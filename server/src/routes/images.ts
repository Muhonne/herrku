import { createReadStream, createWriteStream, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { FastifyInstance } from 'fastify'
import { requireAuth, type SessionUser } from '../auth/session.js'
import { HttpError, badRequest, forbidden, notFound } from '../lib/errors.js'
import {
  deleteStoredImages,
  processAndStoreImage,
  readHead,
  sniffImage,
} from '../lib/images.js'
import { randomToken } from '../lib/tokens.js'

interface RecipeRow {
  id: number
  slug: string
  created_by: number
  image_path: string | null
  image_thumb_path: string | null
}

function findRecipe(app: FastifyInstance, slug: string): RecipeRow | undefined {
  return app.sqlite
    .prepare('select id, slug, created_by, image_path, image_thumb_path from recipes where slug = ?')
    .get(slug) as RecipeRow | undefined
}

function assertCanEdit(user: SessionUser, recipe: RecipeRow): void {
  if (recipe.created_by !== user.id && user.role !== 'admin') {
    throw forbidden('Only the creator or an admin can change this recipe')
  }
}

function isFileTooLarge(error: unknown): boolean {
  return (error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE'
}

export async function imageRoutes(app: FastifyInstance): Promise<void> {
  const { config } = app

  app.post('/api/recipes/:slug/image', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const recipe = findRecipe(app, slug)
    if (!recipe) throw notFound('Recipe not found')
    assertCanEdit(request.user as SessionUser, recipe)

    let part
    try {
      part = await request.file()
    } catch (error) {
      if (isFileTooLarge(error)) {
        throw new HttpError(413, 'payload_too_large', 'Image is too large')
      }
      throw error
    }
    if (!part) throw badRequest('validation_failed', 'No file was uploaded')

    const tempPath = join(config.dataDir, 'uploads', `.tmp-${randomToken()}`)
    try {
      await pipeline(part.file, createWriteStream(tempPath))
    } catch (error) {
      rmSync(tempPath, { force: true })
      if (isFileTooLarge(error)) {
        throw new HttpError(413, 'payload_too_large', 'Image is too large')
      }
      throw error
    }

    if (part.file.truncated) {
      rmSync(tempPath, { force: true })
      throw new HttpError(413, 'payload_too_large', 'Image is too large')
    }

    if (!sniffImage(readHead(tempPath))) {
      rmSync(tempPath, { force: true })
      throw new HttpError(415, 'unsupported_media_type', 'That file is not a supported image')
    }

    let stored
    try {
      stored = await processAndStoreImage({
        tempPath,
        dataDir: config.dataDir,
        recipeId: recipe.id,
      })
    } finally {
      rmSync(tempPath, { force: true })
    }

    await app.db
      .updateTable('recipes')
      .set({
        image_path: stored.imagePath,
        image_thumb_path: stored.thumbPath,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', recipe.id)
      .execute()

    deleteStoredImages(config.dataDir, [recipe.image_path, recipe.image_thumb_path], [
      stored.imagePath,
      stored.thumbPath,
    ])

    return reply.send({
      image: {
        fullUrl: `/api/recipes/${recipe.slug}/image?variant=full`,
        thumbUrl: `/api/recipes/${recipe.slug}/image?variant=thumb`,
      },
    })
  })

  app.delete('/api/recipes/:slug/image', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const recipe = findRecipe(app, slug)
    if (!recipe) throw notFound('Recipe not found')
    assertCanEdit(request.user as SessionUser, recipe)

    await app.db
      .updateTable('recipes')
      .set({
        image_path: null,
        image_thumb_path: null,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', recipe.id)
      .execute()

    deleteStoredImages(config.dataDir, [recipe.image_path, recipe.image_thumb_path])
    return reply.code(204).send()
  })

  app.get('/api/recipes/:slug/image', { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const variant = (request.query as { variant?: string }).variant === 'thumb' ? 'thumb' : 'full'
    const recipe = findRecipe(app, slug)
    if (!recipe) throw notFound('Recipe not found')

    const relativePath = variant === 'thumb' ? recipe.image_thumb_path : recipe.image_path
    if (!relativePath) throw notFound('Image not found')

    const absolutePath = join(config.dataDir, relativePath)
    if (!existsSync(absolutePath)) throw notFound('Image not found')

    return reply
      .header('Cache-Control', 'private, max-age=86400, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .type('image/webp')
      .send(createReadStream(absolutePath))
  })
}
