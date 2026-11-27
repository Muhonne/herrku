import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import compress from '@fastify/compress'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type BetterSqlite from 'better-sqlite3'
import type { Kysely } from 'kysely'
import { ZodError } from 'zod'
import { passwordSchema, usernameSchema } from '@herrku/shared'
import {
  clearSessionCookie,
  cookieName,
  requestOrigin,
  setSessionCookie,
  type SessionUser,
} from './auth/session.js'
import type { Config } from './config.js'
import { applyMigrations } from './db/migrate.js'
import { openDatabase } from './db/open.js'
import type { Database as Schema } from './db/schema.js'
import { HttpError } from './lib/errors.js'
import { cleanupOrphanImages } from './lib/images.js'
import { hashPassword } from './lib/password.js'
import { sha256 } from './lib/tokens.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { imageRoutes } from './routes/images.js'
import { recipeRoutes } from './routes/recipes.js'
import { shoppingRoutes } from './routes/shopping.js'
import { tagRoutes } from './routes/tags.js'
import { tokenRoutes } from './routes/tokens.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
    sessionId: number | null
  }
  interface FastifyInstance {
    sqlite: BetterSqlite.Database
    db: Kysely<Schema>
    config: Config
  }
}

interface SessionRow {
  session_id: number
  expires_at: string
  last_seen_at: string
  persistent: number
  id: number
  username: string
  display_name: string | null
  role: 'admin' | 'member'
  disabled_at: string | null
}

interface ApiTokenRow {
  token_id: number
  last_used_at: string | null
  expires_at: string | null
  id: number
  username: string
  display_name: string | null
  role: 'admin' | 'member'
  disabled_at: string | null
}

export interface BuildAppOptions {
  config: Config
  logger?: boolean
}

const HOUR_MS = 3_600_000

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options

  mkdirSync(join(config.dataDir, 'uploads'), { recursive: true })
  const { sqlite, db } = openDatabase(join(config.dataDir, 'db.sqlite'))
  applyMigrations(sqlite, config.migrationsDir)

  const app = Fastify({
    logger: options.logger === false ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 512 * 1024,
  })

  app.decorate('sqlite', sqlite)
  app.decorate('db', db)
  app.decorate('config', config)
  app.decorateRequest('user', null)
  app.decorateRequest('sessionId', null)

  await app.register(cookie)
  await app.register(helmet, {
    contentSecurityPolicy:
      config.nodeEnv === 'production'
        ? {
            directives: {
              'default-src': ["'self'"],
              'script-src': ["'self'"],
              'style-src': ["'self'"],
              'img-src': ["'self'", 'data:'],
              'connect-src': ["'self'"],
              'font-src': ["'self'"],
              'object-src': ["'none'"],
              'base-uri': ["'none'"],
              'form-action': ["'self'"],
              'frame-ancestors': ["'none'"],
              'upgrade-insecure-requests': null,
            },
          }
        : false,
    crossOriginOpenerPolicy: config.nodeEnv === 'production' ? { policy: 'same-origin' } : false,
    referrerPolicy: { policy: 'same-origin' },
    strictTransportSecurity: false,
  })
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1, fields: 20 },
  })
  await app.register(compress, { global: true })

  if (config.rateLimit) {
    await app.register(rateLimit, {
      global: true,
      max: config.rateLimit.globalMax,
      timeWindow: config.rateLimit.globalWindowMs,
      keyGenerator: (request) => {
        const authorization = request.headers.authorization
        return typeof authorization === 'string' ? sha256(authorization) : request.ip
      },
      errorResponseBuilder: (_request, context) => ({
        error: {
          code: 'rate_limited',
          message: `Too many requests, retry in ${context.after}`,
        },
      }),
    })
  }

  const webRoot = config.webRoot
  const hasWebBuild = webRoot !== null && existsSync(join(webRoot, 'index.html'))
  if (hasWebBuild && webRoot) {
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      wildcard: false,
      setHeaders: (reply, filePath) => {
        if (filePath.endsWith('index.html')) {
          reply.header('Cache-Control', 'no-cache')
        } else if (filePath.includes('/assets/')) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    })
  }

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith('/api')) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } })
    }
    if (hasWebBuild) return reply.type('text/html').sendFile('index.html')
    return reply.code(404).type('text/plain').send('Not found')
  })

  app.setErrorHandler((error, request, reply) => {
    const shaped = error as { error?: { code?: string; message?: string } }
    if (shaped.error?.code === 'rate_limited') {
      return reply.code(429).send({
        error: {
          code: 'rate_limited',
          message: shaped.error.message ?? 'Too many requests',
        },
      })
    }

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      })
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'validation_failed',
          message: 'The request contains invalid values',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      })
    }

    const errorCode = (error as { code?: string }).code
    if (errorCode === 'FST_ERR_CTP_BODY_TOO_LARGE' || errorCode === 'FST_REQ_FILE_TOO_LARGE') {
      return reply
        .code(413)
        .send({ error: { code: 'payload_too_large', message: 'Request too large' } })
    }
    if (errorCode === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply
        .code(415)
        .send({ error: { code: 'unsupported_media_type', message: 'Unsupported media type' } })
    }

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    if (statusCode < 400 || statusCode >= 500) {
      app.log.error({ err: error, url: request.url }, 'unhandled error')
      return reply
        .code(500)
        .send({ error: { code: 'internal_error', message: 'Internal server error' } })
    }

    return reply.code(statusCode).send({
      error: { code: 'bad_request', message: (error as Error).message ?? 'Bad request' },
    })
  })

  const sessionLookup = sqlite.prepare(
    `select s.id as session_id, s.expires_at, s.last_seen_at, s.persistent,
            u.id, u.username, u.display_name, u.role, u.disabled_at
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = ?`,
  )
  const sessionTouch = sqlite.prepare(
    'update sessions set last_seen_at = ?, expires_at = ? where id = ?',
  )
  const sessionDelete = sqlite.prepare('delete from sessions where id = ?')
  const apiTokenLookup = sqlite.prepare(
    `select t.id as token_id, t.last_used_at, t.expires_at,
            u.id, u.username, u.display_name, u.role, u.disabled_at
       from api_tokens t join users u on u.id = t.user_id
      where t.token_hash = ?`,
  )
  const apiTokenTouch = sqlite.prepare('update api_tokens set last_used_at = ? where id = ?')

  app.addHook('onRequest', async (request, reply) => {
    const authorization = request.headers.authorization
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      const secret = authorization.slice('Bearer '.length).trim()
      const row = apiTokenLookup.get(sha256(secret)) as ApiTokenRow | undefined

      if (
        !row ||
        row.disabled_at !== null ||
        (row.expires_at !== null && Date.parse(row.expires_at) <= Date.now())
      ) {
        throw new HttpError(401, 'unauthorized', 'Invalid or expired API token')
      }

      request.user = {
        id: row.id,
        username: row.username,
        displayName: row.display_name ?? row.username,
        role: row.role,
      }
      request.sessionId = null

      if (row.last_used_at === null || Date.now() - Date.parse(row.last_used_at) >= HOUR_MS) {
        apiTokenTouch.run(new Date().toISOString(), row.token_id)
      }
      return
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.url.startsWith('/api')) {
      const origin = requestOrigin(request)
      if (!origin || !config.allowedOrigins.includes(origin)) {
        throw new HttpError(403, 'csrf_failed', 'Cross-origin request rejected')
      }
    }

    const token = request.cookies?.[cookieName(config.cookieSecure)]
    if (!token) return

    const row = sessionLookup.get(sha256(token)) as SessionRow | undefined
    if (!row) {
      clearSessionCookie(reply, config)
      return
    }
    if (row.disabled_at !== null) {
      sessionDelete.run(row.session_id)
      clearSessionCookie(reply, config)
      return
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      sessionDelete.run(row.session_id)
      clearSessionCookie(reply, config)
      return
    }

    request.user = {
      id: row.id,
      username: row.username,
      displayName: row.display_name ?? row.username,
      role: row.role,
    }
    request.sessionId = row.session_id

    if (Date.now() - Date.parse(row.last_seen_at) >= HOUR_MS) {
      const now = new Date()
      sessionTouch.run(
        now.toISOString(),
        new Date(now.getTime() + config.sessionTtlDays * 86_400_000).toISOString(),
        row.session_id,
      )
      setSessionCookie(reply, token, config, row.persistent === 1)
    }
  })

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(adminRoutes)
  await app.register(recipeRoutes)
  await app.register(imageRoutes)
  await app.register(tagRoutes)
  await app.register(shoppingRoutes)
  await app.register(tokenRoutes)

  await seedAdmin(app)
  cleanupOrphanImages(app)

  const cleanup = setInterval(() => {
    try {
      const now = new Date().toISOString()
      sqlite.prepare('delete from sessions where expires_at < ?').run(now)
      sqlite
        .prepare('delete from invites where expires_at < ? or (used_at is not null and used_at < ?)')
        .run(now, new Date(Date.now() - 86_400_000).toISOString())
    } catch (error) {
      app.log.warn({ err: error }, 'cleanup tick failed')
    }
  }, HOUR_MS)
  cleanup.unref()

  app.addHook('onClose', async () => {
    clearInterval(cleanup)
    await db.destroy()
    sqlite.close()
  })

  return app
}

async function seedAdmin(app: FastifyInstance): Promise<void> {
  const count = await app.db
    .selectFrom('users')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow()

  if (Number(count.count) > 0) return

  const { adminUsername, adminPassword } = app.config
  if (!adminUsername || !adminPassword) {
    app.log.error('No users exist and ADMIN_USERNAME/ADMIN_PASSWORD are not set; nobody can sign in')
    return
  }

  usernameSchema.parse(adminUsername)
  passwordSchema.parse(adminPassword)

  const now = new Date().toISOString()
  await app.db
    .insertInto('users')
    .values({
      username: adminUsername.toLowerCase(),
      display_name: adminUsername,
      password_hash: await hashPassword(adminPassword),
      role: 'admin',
      created_at: now,
      updated_at: now,
    })
    .execute()

  app.log.info({ username: adminUsername }, 'created initial admin account')
}
