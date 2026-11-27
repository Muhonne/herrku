import { loadConfig } from '../config.js'
import { applyMigrations } from '../db/migrate.js'
import { openDatabase } from '../db/open.js'

const config = loadConfig()
const { sqlite } = openDatabase(`${config.dataDir}/db.sqlite`)
const applied = applyMigrations(sqlite, config.migrationsDir)

if (applied.length === 0) {
  console.log('No pending migrations')
} else {
  console.log(`Applied migrations: ${applied.join(', ')}`)
}

sqlite.close()
