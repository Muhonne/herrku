import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/session.js'

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tags', { preHandler: requireAuth }, async () => {
    const rows = app.sqlite
      .prepare('select tag, count(*) as count from recipe_tags group by tag order by tag')
      .all() as { tag: string; count: number }[]

    return { tags: rows.map((row) => ({ tag: row.tag, count: row.count })) }
  })
}
