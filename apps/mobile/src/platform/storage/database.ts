import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import {
  runSqlMigrations,
} from '@/foundation/sqlite'
import { MOBILE_SQL_MIGRATIONS } from '@/platform/storage/migrations'

export const MOBILE_DATABASE_NAME = 'trip-diary.db'

export class MobileDatabaseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'MobileDatabaseError'
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

let databasePromise: Promise<SQLiteDatabase> | null = null

async function openAndMigrateDatabase(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(MOBILE_DATABASE_NAME)

  await db.execAsync('PRAGMA foreign_keys = ON;')
  await db.execAsync('PRAGMA journal_mode = WAL;')
  await runSqlMigrations(db, MOBILE_SQL_MIGRATIONS)

  return db
}

/**
 * Returns a migrated SQLite connection. Concurrent callers share one open +
 * migration run per process. After a failed initialization the in-flight
 * promise is cleared so a later call can retry.
 */
export async function getMobileDatabase(): Promise<SQLiteDatabase> {
  if (databasePromise === null) {
    databasePromise = openAndMigrateDatabase().catch((error: unknown) => {
      databasePromise = null
      throw new MobileDatabaseError('Failed to initialize mobile database', {
        cause: error,
      })
    })
  }

  return databasePromise
}

/** Explicit alias for startup paths that want a named initialize call. */
export async function initializeMobileDatabase(): Promise<SQLiteDatabase> {
  return getMobileDatabase()
}

/** Test-only: clears the module-level initialization promise. */
export function resetMobileDatabaseForTests(): void {
  databasePromise = null
}
