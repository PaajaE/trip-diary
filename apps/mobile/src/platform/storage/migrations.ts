import type {
  SqlMigration,
  SqlMigrationExecutor,
} from '@/foundation/sqlite/migration-runner'

async function syncQueueHasColumn(
  db: SqlMigrationExecutor,
  columnName: string,
): Promise<boolean> {
  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(sync_queue)',
  )
  return columns.some((column) => column.name === columnName)
}

export const MOBILE_SQL_MIGRATIONS: readonly SqlMigration[] = [
  {
    id: 1,
    name: 'create_journey_cache',
    sql: `
      CREATE TABLE IF NOT EXISTS journey_cache (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );
    `,
  },
  {
    id: 2,
    name: 'create_sync_queue',
    sql: `
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY NOT NULL,
        operation_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    id: 3,
    name: 'add_sync_queue_status_updated_at',
    up: async (db) => {
      const hasStatusUpdatedAt = await syncQueueHasColumn(
        db,
        'status_updated_at',
      )

      if (!hasStatusUpdatedAt) {
        await db.execAsync(
          "ALTER TABLE sync_queue ADD COLUMN status_updated_at TEXT NOT NULL DEFAULT '';",
        )
      }

      await db.runAsync(
        "UPDATE sync_queue SET status_updated_at = created_at WHERE status_updated_at = '' OR status_updated_at IS NULL",
      )
    },
  },
  {
    id: 4,
    name: 'create_journey_list_cache',
    sql: `
      CREATE TABLE IF NOT EXISTS journey_list_cache (
        user_id TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (user_id, journey_id)
      );

      CREATE INDEX IF NOT EXISTS idx_journey_list_cache_user_sort
        ON journey_list_cache (user_id, sort_order);
    `,
  },
  {
    id: 5,
    name: 'create_journey_stop_cache',
    sql: `
      CREATE TABLE IF NOT EXISTS journey_stop_cache (
        user_id TEXT NOT NULL,
        journey_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (user_id, journey_id)
      );
    `,
  },
  {
    id: 6,
    name: 'add_journey_list_cache_space_id',
    up: async (db) => {
      const columns = await db.getAllAsync<{ name: string }>(
        'PRAGMA table_info(journey_list_cache)',
      )
      const hasSpaceId = columns.some((column) => column.name === 'space_id')
      if (!hasSpaceId) {
        await db.execAsync(
          "ALTER TABLE journey_list_cache ADD COLUMN space_id TEXT NOT NULL DEFAULT '';",
        )
      }

      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_journey_list_cache_user_space_sort
          ON journey_list_cache (user_id, space_id, sort_order);
      `)
    },
  },
]
