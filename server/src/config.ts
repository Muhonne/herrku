import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface RateLimitConfig {
  loginMax: number
  loginWindowMs: number
  globalMax: number
  globalWindowMs: number
}

export interface Config {
  nodeEnv: string
  port: number
  dataDir: string
  publicUrl: string | null
  allowedOrigins: string[]
  cookieSecure: boolean
  trustProxy: boolean
  sessionTtlDays: number
  inviteTtlHours: number
  maxUploadMb: number
  adminUsername: string | null
  adminPassword: string | null
  logLevel: string
  webRoot: string | null
  migrationsDir: string
  rateLimit: RateLimitConfig | false
  version: string
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  loginMax: 10,
  loginWindowMs: 15 * 60_000,
  globalMax: 100,
  globalWindowMs: 60_000,
}

function readVersion(): string {
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    const parsed = JSON.parse(raw) as { version?: string }
    return parsed.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? 'development'
  const isProduction = nodeEnv === 'production'

  const rawPublicUrl = env.PUBLIC_URL?.trim() || null
  const publicUrl = rawPublicUrl ?? (isProduction ? null : 'http://localhost:5173')

  if (isProduction) {
    if (!publicUrl) throw new Error('PUBLIC_URL is required in production')
    if (!/^https?:\/\//i.test(publicUrl)) {
      throw new Error('PUBLIC_URL must be an absolute http(s) URL')
    }
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS?.split(',') ?? (publicUrl ? [publicUrl] : []))
    .map((origin) => origin.trim())
    .filter(Boolean)

  const cookieSecure = env.COOKIE_SECURE ? env.COOKIE_SECURE !== 'false' : true

  return {
    nodeEnv,
    port: Number(env.PORT ?? 3000),
    dataDir: env.DATA_DIR ?? '/data',
    publicUrl,
    allowedOrigins,
    cookieSecure,
    trustProxy: env.TRUST_PROXY === 'true',
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
    inviteTtlHours: Number(env.INVITE_TTL_HOURS ?? 168),
    maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 5),
    adminUsername: env.ADMIN_USERNAME ?? null,
    adminPassword: env.ADMIN_PASSWORD ?? null,
    logLevel: env.LOG_LEVEL ?? 'info',
    webRoot: env.WEB_ROOT ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
    migrationsDir: env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../../migrations', import.meta.url)),
    rateLimit: DEFAULT_RATE_LIMIT,
    version: readVersion(),
  }
}
