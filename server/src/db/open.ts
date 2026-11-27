import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import type { Database as Schema } from './schema.js'

export interface OpenedDatabase {
  sqlite: Database.Database
  db: Kysely<Schema>
}

export function openDatabase(file: string): OpenedDatabase {
  mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('temp_store = MEMORY')

  const db = new Kysely<Schema>({
    dialect: new SqliteDialect({ database: sqlite }),
  })

  return { sqlite, db }
}
