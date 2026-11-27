import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

interface MigrationRow {
  version: string
}

export function applyMigrations(sqlite: Database.Database, directory: string): string[] {
  sqlite.exec(
    'create table if not exists schema_migrations (version text primary key, applied_at text not null)',
  )

  const applied = new Set(
    (sqlite.prepare('select version from schema_migrations').all() as MigrationRow[]).map(
      (row) => row.version,
    ),
  )

  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const appliedNow: string[] = []

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    if (applied.has(version)) continue

    const sql = readFileSync(join(directory, file), 'utf8')
    sqlite.exec('BEGIN immediate')
    try {
      sqlite.exec(sql)
      sqlite
        .prepare('insert into schema_migrations (version, applied_at) values (?, ?)')
        .run(version, new Date().toISOString())
      sqlite.exec('COMMIT')
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error })
    }

    appliedNow.push(version)
  }

  return appliedNow
}
