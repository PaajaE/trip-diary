import { beforeEach, describe, expect, it } from 'vitest'
import {
  runSqlMigrations,
  SqlMigrationError,
  type SqlMigrationExecutor,
} from './migration-runner'

function createMigrationDb(): SqlMigrationExecutor & {
  tables: Map<string, unknown>
} {
  const tables = new Map<string, unknown>()

  return {
    tables,
    async execAsync(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS settings')) {
        tables.set('settings', new Map())
      }
      if (sql.includes('CREATE TABLE IF NOT EXISTS _schema_migrations')) {
        if (!tables.has('_schema_migrations')) {
          tables.set(
            '_schema_migrations',
            new Map<number, { id: number; name: string }>(),
          )
        }
      }
    },
    async getAllAsync() {
      return []
    },
    async getFirstAsync<T>(sql: string, id: number): Promise<T | null> {
      if (sql.includes('_schema_migrations')) {
        const migrations = tables.get('_schema_migrations') as
          | Map<number, { id: number; name: string }>
          | undefined
        return (migrations?.get(id) as T | undefined) ?? null
      }
      return null
    },
    async runAsync(sql: string, id: number, name: string) {
      if (sql.includes('INSERT INTO _schema_migrations')) {
        const existingMigrations = tables.get('_schema_migrations')
        const migrations =
          existingMigrations instanceof Map
            ? existingMigrations
            : new Map<number, { id: number; name: string }>()
        migrations.set(id, { id, name })
        tables.set('_schema_migrations', migrations)
      }
    },
  }
}

describe('runSqlMigrations', () => {
  let db: ReturnType<typeof createMigrationDb>

  beforeEach(() => {
    db = createMigrationDb()
  })

  it('applies numbered migrations once', async () => {
    const migrations = [
      {
        id: 1,
        name: 'create_settings',
        sql: `
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
          );
        `,
      },
      {
        id: 2,
        name: 'add_settings_index',
        sql: 'CREATE INDEX IF NOT EXISTS settings_value_idx ON settings(value);',
      },
    ]

    expect(await runSqlMigrations(db, migrations)).toBe(2)
    expect(await runSqlMigrations(db, migrations)).toBe(0)
    expect(db.tables.has('settings')).toBe(true)
  })

  it('applies migrations in ascending id order', async () => {
    const applied: number[] = []
    const trackingDb: SqlMigrationExecutor = {
      async execAsync(sql) {
        if (sql.includes('migration_two')) {
          applied.push(2)
        }
        if (sql.includes('migration_one')) {
          applied.push(1)
        }
        if (sql.includes('_schema_migrations')) {
          await db.execAsync(sql)
        }
      },
      getAllAsync: async () => [],
      getFirstAsync: db.getFirstAsync.bind(db),
      runAsync: db.runAsync.bind(db),
    }

    await runSqlMigrations(trackingDb, [
      { id: 2, name: 'second', sql: '-- migration_two' },
      { id: 1, name: 'first', sql: '-- migration_one' },
    ])

    expect(applied).toEqual([1, 2])
  })

  it('does not record a migration when apply fails', async () => {
    const failingDb: SqlMigrationExecutor = {
      async execAsync(sql) {
        await db.execAsync(sql)
      },
      async getAllAsync() {
        return []
      },
      getFirstAsync: db.getFirstAsync.bind(db),
      async runAsync(sql, ...params) {
        if (sql.includes('INSERT INTO _schema_migrations')) {
          throw new Error('write failed')
        }
        return db.runAsync(sql, ...params)
      },
    }

    await expect(
      runSqlMigrations(failingDb, [
        { id: 1, name: 'first', sql: '-- migration_one' },
      ]),
    ).rejects.toBeInstanceOf(SqlMigrationError)

    expect(await runSqlMigrations(db, [])).toBe(0)
  })
})
