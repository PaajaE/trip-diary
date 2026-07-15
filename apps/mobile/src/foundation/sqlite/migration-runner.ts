export interface SqlMigrationExecutor {
  execAsync(sql: string): Promise<void>
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>
  withTransactionAsync?(task: () => Promise<void>): Promise<void>
}

export interface SqlMigration {
  id: number
  name: string
  sql?: string
  up?: (db: SqlMigrationExecutor) => Promise<void>
}

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`

export class SqlMigrationError extends Error {
  constructor(
    readonly migrationId: number,
    readonly migrationName: string,
    cause: unknown,
  ) {
    const message =
      cause instanceof Error
        ? cause.message
        : typeof cause === 'string'
          ? cause
          : 'Unknown migration error'
    super(`Migration ${String(migrationId)} (${migrationName}) failed: ${message}`)
    this.name = 'SqlMigrationError'
    this.cause = cause
  }
}

async function applyMigration(
  db: SqlMigrationExecutor,
  migration: SqlMigration,
): Promise<void> {
  if (migration.up !== undefined) {
    await migration.up(db)
    return
  }

  if (migration.sql !== undefined) {
    await db.execAsync(migration.sql)
    return
  }

  throw new Error(`Migration ${String(migration.id)} has no sql or up handler`)
}

export async function runSqlMigrations(
  db: SqlMigrationExecutor,
  migrations: readonly SqlMigration[],
): Promise<number> {
  await db.execAsync(MIGRATIONS_TABLE)

  const sorted = [...migrations].sort((left, right) => left.id - right.id)
  let appliedCount = 0

  for (const migration of sorted) {
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM _schema_migrations WHERE id = ?',
      migration.id,
    )

    if (existing !== null) {
      continue
    }

    const recordMigration = async (): Promise<void> => {
      await applyMigration(db, migration)
      await db.runAsync(
        'INSERT INTO _schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
        migration.id,
        migration.name,
        new Date().toISOString(),
      )
    }

    try {
      if (db.withTransactionAsync !== undefined) {
        await db.withTransactionAsync(recordMigration)
      } else {
        await recordMigration()
      }

      appliedCount += 1
    } catch (error) {
      throw new SqlMigrationError(migration.id, migration.name, error)
    }
  }

  return appliedCount
}
