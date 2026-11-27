import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_request, reply) => {
    try {
      app.sqlite.prepare('select 1 as ok').get()
      return { ok: true, version: app.config.version, db: 'ok' }
    } catch {
      return reply.code(503).send({ ok: false, version: app.config.version, db: 'error' })
    }
  })
}
