import type { SqlMigrationExecutor } from '@/foundation/sqlite/migration-runner'

type Row = Record<string, unknown>

interface TableDefinition {
  columns: string[]
  rows: Map<string, Row>
}

export interface InMemorySQLiteDatabase extends SqlMigrationExecutor {
  reset(): void
  seedLegacySyncQueueRow(row: {
    created_at: string
    id: string
    operation_type: string
    payload: string
    status: string
  }): void
  seedSyncQueueRow(row: {
    created_at: string
    id: string
    operation_type: string
    payload: string
    status: string
    status_updated_at?: string
  }): void
  seedJourneyCacheRow(row: {
    cached_at: string
    id: string
    payload: string
  }): void
  seedJourneyListCacheRow(row: {
    cached_at: string
    journey_id: string
    payload: string
    sort_order: number
    space_id?: string
    user_id: string
  }): void
  seedJourneyStopCacheRow(row: {
    cached_at: string
    journey_id: string
    payload: string
    user_id: string
  }): void
  tableHasColumn(tableName: string, columnName: string): boolean
  getMigrationIds(): number[]
  getTableRowCount(tableName: string): number
  getSyncQueueRow(id: string): Row | undefined
  getJourneyCacheRow(id: string): Row | undefined
  getJourneyListCacheRowsForUser(userId: string): Row[]
  getJourneyStopCacheRow(userId: string, journeyId: string): Row | undefined
}

export function createInMemorySQLiteDatabase(): InMemorySQLiteDatabase {
  const tables = new Map<string, TableDefinition>()

  function ensureTable(tableName: string, columns: string[]): TableDefinition {
    const existing = tables.get(tableName)
    if (existing !== undefined) {
      for (const column of columns) {
        if (!existing.columns.includes(column)) {
          existing.columns.push(column)
          for (const row of existing.rows.values()) {
            row[column] = null
          }
        }
      }
      return existing
    }

    const created: TableDefinition = {
      columns: [...columns],
      rows: new Map(),
    }
    tables.set(tableName, created)
    return created
  }

  function addColumn(
    tableName: string,
    columnName: string,
    defaultValue: unknown,
  ) {
    const table = tables.get(tableName)
    if (table === undefined || table.columns.includes(columnName)) {
      return
    }

    table.columns.push(columnName)
    for (const row of table.rows.values()) {
      row[columnName] = defaultValue
    }
  }

  const db: InMemorySQLiteDatabase = {
    reset() {
      tables.clear()
    },

    seedLegacySyncQueueRow(row) {
      const table = ensureTable('sync_queue', [
        'id',
        'operation_type',
        'payload',
        'status',
        'created_at',
      ])
      table.rows.set(row.id, { ...row })
    },

    seedSyncQueueRow(row) {
      const table = ensureTable('sync_queue', [
        'id',
        'operation_type',
        'payload',
        'status',
        'created_at',
        'status_updated_at',
      ])
      table.rows.set(row.id, {
        created_at: row.created_at,
        id: row.id,
        operation_type: row.operation_type,
        payload: row.payload,
        status: row.status,
        status_updated_at: row.status_updated_at ?? '',
      })
    },

    seedJourneyCacheRow(row) {
      const table = ensureTable('journey_cache', ['id', 'payload', 'cached_at'])
      table.rows.set(row.id, { ...row })
    },

    seedJourneyListCacheRow(row) {
      const table = ensureTable('journey_list_cache', [
        'user_id',
        'space_id',
        'journey_id',
        'payload',
        'sort_order',
        'cached_at',
      ])
      const spaceId =
        typeof row.space_id === 'string' && row.space_id.length > 0
          ? row.space_id
          : ''
      table.rows.set(`${row.user_id}:${spaceId}:${row.journey_id}`, {
        ...row,
        space_id: spaceId,
      })
    },

    seedJourneyStopCacheRow(row) {
      const table = ensureTable('journey_stop_cache', [
        'user_id',
        'journey_id',
        'payload',
        'cached_at',
      ])
      table.rows.set(`${row.user_id}:${row.journey_id}`, { ...row })
    },

    tableHasColumn(tableName, columnName) {
      return tables.get(tableName)?.columns.includes(columnName) ?? false
    },

    getMigrationIds() {
      const table = tables.get('_schema_migrations')
      if (table === undefined) {
        return []
      }

      return [...table.rows.values()]
        .map((row) => Number(row.id))
        .sort((left, right) => left - right)
    },

    getTableRowCount(tableName) {
      return tables.get(tableName)?.rows.size ?? 0
    },

    getSyncQueueRow(id) {
      return tables.get('sync_queue')?.rows.get(id)
    },

    getJourneyCacheRow(id) {
      return tables.get('journey_cache')?.rows.get(id)
    },

    getJourneyListCacheRowsForUser(userId) {
      const table = tables.get('journey_list_cache')
      if (table === undefined) {
        return []
      }

      return [...table.rows.values()]
        .filter((row) => row.user_id === userId)
        .sort(
          (left, right) => Number(left.sort_order) - Number(right.sort_order),
        )
    },

    getJourneyStopCacheRow(userId, journeyId) {
      return tables
        .get('journey_stop_cache')
        ?.rows.get(`${userId}:${journeyId}`)
    },

    async execAsync(sql) {
      const normalized = sql.trim()

      if (normalized.includes('CREATE TABLE IF NOT EXISTS journey_cache')) {
        ensureTable('journey_cache', ['id', 'payload', 'cached_at'])
        return
      }

      if (normalized.includes('CREATE TABLE IF NOT EXISTS sync_queue')) {
        ensureTable('sync_queue', [
          'id',
          'operation_type',
          'payload',
          'status',
          'created_at',
        ])
        return
      }

      if (
        normalized.includes('CREATE TABLE IF NOT EXISTS _schema_migrations')
      ) {
        ensureTable('_schema_migrations', ['id', 'name', 'applied_at'])
        return
      }

      if (
        normalized.includes('CREATE TABLE IF NOT EXISTS journey_list_cache')
      ) {
        ensureTable('journey_list_cache', [
          'user_id',
          'journey_id',
          'payload',
          'sort_order',
          'cached_at',
          'space_id',
        ])
        return
      }

      if (
        normalized.includes(
          'CREATE INDEX IF NOT EXISTS idx_journey_list_cache_user_sort',
        ) ||
        normalized.includes(
          'CREATE INDEX IF NOT EXISTS idx_journey_list_cache_user_space_sort',
        )
      ) {
        return
      }

      if (
        normalized.includes(
          'ALTER TABLE journey_list_cache ADD COLUMN space_id',
        )
      ) {
        addColumn('journey_list_cache', 'space_id', '')
        return
      }

      if (
        normalized.includes('CREATE TABLE IF NOT EXISTS journey_stop_cache')
      ) {
        ensureTable('journey_stop_cache', [
          'user_id',
          'journey_id',
          'payload',
          'cached_at',
        ])
        return
      }

      if (
        normalized.includes('CREATE TABLE IF NOT EXISTS moment_draft_photos')
      ) {
        ensureTable('moment_draft_photos', [
          'id',
          'draft_key',
          'journey_id',
          'entry_id',
          'status',
          'local_uri',
          'thumb_uri',
          'mime_type',
          'width',
          'height',
          'byte_size',
          'captured_at',
          'latitude',
          'longitude',
          'is_cover',
          'position',
          'diagnostics',
          'created_at',
          'updated_at',
        ])
        return
      }

      if (normalized.includes('CREATE TABLE IF NOT EXISTS local_moments')) {
        ensureTable('local_moments', [
          'id',
          'journey_id',
          'space_id',
          'creator_id',
          'title',
          'body',
          'type',
          'language',
          'visibility',
          'event_at',
          'slug',
          'stage_id',
          'stop_id',
          'latitude',
          'longitude',
          'location_title',
          'sync_status',
          'created_at',
          'updated_at',
        ])
        if (
          normalized.includes('CREATE TABLE IF NOT EXISTS journey_content_cache')
        ) {
          ensureTable('journey_content_cache', [
            'journey_id',
            'payload',
            'cached_at',
          ])
        }
        return
      }

      if (
        normalized.includes('CREATE TABLE IF NOT EXISTS journey_content_cache')
      ) {
        ensureTable('journey_content_cache', [
          'journey_id',
          'payload',
          'cached_at',
        ])
        return
      }

      if (
        normalized.includes(
          'CREATE INDEX IF NOT EXISTS idx_moment_draft_photos_draft_key',
        ) ||
        normalized.includes(
          'CREATE INDEX IF NOT EXISTS idx_local_moments_journey',
        )
      ) {
        return
      }

      if (
        normalized.includes(
          'ALTER TABLE sync_queue ADD COLUMN status_updated_at',
        )
      ) {
        addColumn('sync_queue', 'status_updated_at', '')
        return
      }

      if (
        normalized.startsWith('PRAGMA foreign_keys') ||
        normalized.startsWith('PRAGMA journal_mode')
      ) {
        return
      }
    },

    async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('PRAGMA table_info(sync_queue)')) {
        const table = tables.get('sync_queue')
        if (table === undefined) {
          return []
        }

        return table.columns.map((name) => ({ name })) as T[]
      }

      if (sql.includes('FROM moment_draft_photos')) {
        const table = tables.get('moment_draft_photos')
        if (table === undefined) {
          return []
        }

        let rows = [...table.rows.values()]
        if (sql.includes('WHERE draft_key = ?')) {
          const draftKey = String(params[0])
          rows = rows.filter((row) => row.draft_key === draftKey)
        }
        if (sql.includes("status IN ('ready', 'failed', 'enqueued')")) {
          rows = rows.filter((row) =>
            ['ready', 'failed', 'enqueued'].includes(String(row.status)),
          )
        }
        rows.sort((left, right) => {
          const positionDelta =
            Number(left.position) - Number(right.position)
          if (positionDelta !== 0) {
            return positionDelta
          }
          return String(left.created_at).localeCompare(String(right.created_at))
        })
        return rows as T[]
      }

      if (sql.includes('FROM local_moments')) {
        const table = tables.get('local_moments')
        if (table === undefined) {
          return []
        }
        let rows = [...table.rows.values()]
        if (sql.includes('WHERE journey_id = ?')) {
          const journeyId = String(params[0])
          rows = rows.filter((row) => row.journey_id === journeyId)
        }
        return rows as T[]
      }

      if (sql.includes('PRAGMA table_info(journey_list_cache)')) {
        const table = tables.get('journey_list_cache')
        if (table === undefined) {
          return []
        }

        return table.columns.map((name) => ({ name })) as T[]
      }

      if (sql.includes("FROM sync_queue WHERE status = 'failed'")) {
        const table = tables.get('sync_queue')
        if (table === undefined) {
          return []
        }

        return [...table.rows.values()]
          .filter((row) => row.status === 'failed')
          .map((row) =>
            sql.includes('SELECT id, payload')
              ? ({ id: row.id, payload: row.payload } as T)
              : ({ payload: row.payload } as T),
          )
      }

      if (
        sql.includes('FROM sync_queue') &&
        sql.includes("WHERE status = 'pending'")
      ) {
        const table = tables.get('sync_queue')
        if (table === undefined) {
          return []
        }

        return [...table.rows.values()]
          .filter((row) => row.status === 'pending')
          .sort((left, right) =>
            String(left.created_at).localeCompare(String(right.created_at)),
          )
          .map(
            (row) =>
              ({
                created_at: row.created_at,
                id: row.id,
                operation_type: row.operation_type,
                payload: row.payload,
                status: row.status,
                status_updated_at: row.status_updated_at,
              }) as T,
          )
      }

      if (
        sql.includes('FROM sync_queue') &&
        sql.includes('operation_type IN')
      ) {
        const table = tables.get('sync_queue')
        if (table === undefined) {
          return []
        }
        const allowed = new Set(params.map(String))
        return [...table.rows.values()]
          .filter((row) => allowed.has(String(row.operation_type)))
          .filter((row) =>
            ['pending', 'failed', 'processing'].includes(String(row.status)),
          )
          .map((row) => ({ id: row.id, payload: row.payload }) as T)
      }

      if (
        sql.includes('FROM sync_queue') &&
        sql.includes("operation_type = 'photo.upload'")
      ) {
        const table = tables.get('sync_queue')
        if (table === undefined) {
          return []
        }

        return [...table.rows.values()]
          .filter((row) => {
            if (row.operation_type !== 'photo.upload') {
              return false
            }
            if (
              sql.includes(
                "status IN ('pending', 'processing', 'failed')",
              )
            ) {
              return ['pending', 'processing', 'failed'].includes(
                String(row.status),
              )
            }
            return true
          })
          .map((row) => ({ payload: row.payload }) as T)
      }

      if (sql.includes('FROM journey_list_cache')) {
        const table = tables.get('journey_list_cache')
        if (table === undefined) {
          return []
        }

        const [userId, spaceId] = params as [string, string?]
        return [...table.rows.values()]
          .filter((row) => {
            if (row.user_id !== userId) {
              return false
            }
            if (spaceId !== undefined) {
              const rowSpaceId =
                typeof row.space_id === 'string' ? row.space_id : ''
              return rowSpaceId === spaceId
            }
            return true
          })
          .sort(
            (left, right) => Number(left.sort_order) - Number(right.sort_order),
          )
          .map(
            (row) =>
              ({
                cached_at: row.cached_at,
                journey_id: row.journey_id,
                payload: row.payload,
                sort_order: row.sort_order,
                space_id: row.space_id ?? '',
              }) as T,
          )
      }

      return []
    },

    async getFirstAsync<T>(
      sql: string,
      ...params: unknown[]
    ): Promise<T | null> {
      if (sql.includes('SELECT id FROM _schema_migrations WHERE id = ?')) {
        const table = tables.get('_schema_migrations')
        const id = params[0]
        return (table?.rows.get(String(id)) as T | undefined) ?? null
      }

      if (sql.includes('SELECT payload FROM journey_cache WHERE id = ?')) {
        const table = tables.get('journey_cache')
        const id = params[0]
        const row = table?.rows.get(String(id))
        return row === undefined ? null : ({ payload: row.payload } as T)
      }

      if (sql.includes('FROM journey_stop_cache')) {
        const table = tables.get('journey_stop_cache')
        if (table === undefined) {
          return null
        }

        const [userId, journeyId] = params as [string, string]
        const row = table.rows.get(`${userId}:${journeyId}`)
        return row === undefined
          ? null
          : ({ cached_at: row.cached_at, payload: row.payload } as T)
      }

      if (sql.includes("status = 'pending'")) {
        const table = tables.get('sync_queue')
        if (table === undefined) {
          return null
        }

        const pending = [...table.rows.values()]
          .filter((row) => row.status === 'pending')
          .sort((left, right) =>
            String(left.created_at).localeCompare(String(right.created_at)),
          )

        return (pending[0] as T | undefined) ?? null
      }

      if (sql.includes('WHERE id = ?')) {
        if (sql.includes('FROM moment_draft_photos')) {
          const table = tables.get('moment_draft_photos')
          const id = params[0]
          return (table?.rows.get(String(id)) as T | undefined) ?? null
        }
        if (sql.includes('FROM local_moments')) {
          const table = tables.get('local_moments')
          const id = params[0]
          return (table?.rows.get(String(id)) as T | undefined) ?? null
        }
        if (sql.includes('FROM journey_content_cache')) {
          const table = tables.get('journey_content_cache')
          const id = params[0]
          return (table?.rows.get(String(id)) as T | undefined) ?? null
        }
        const table = tables.get('sync_queue')
        const id = params[0]
        return (table?.rows.get(String(id)) as T | undefined) ?? null
      }

      if (sql.includes('FROM journey_content_cache WHERE journey_id = ?')) {
        const table = tables.get('journey_content_cache')
        const id = String(params[0])
        return (table?.rows.get(id) as T | undefined) ?? null
      }

      if (
        sql.includes('FROM sync_queue') &&
        sql.includes('operation_type = ?') &&
        sql.includes('id = ?')
      ) {
        const table = tables.get('sync_queue')
        const operationType = String(params[0])
        const id = String(params[1])
        const row = table?.rows.get(id)
        if (
          row === undefined ||
          row.operation_type !== operationType ||
          !['pending', 'processing', 'failed'].includes(String(row.status))
        ) {
          return null
        }
        return { id: row.id } as T
      }

      return null
    },

    async runAsync(sql, ...params) {
      if (sql.includes('INSERT INTO moment_draft_photos')) {
        const table = ensureTable('moment_draft_photos', [
          'id',
          'draft_key',
          'journey_id',
          'entry_id',
          'status',
          'local_uri',
          'thumb_uri',
          'mime_type',
          'width',
          'height',
          'byte_size',
          'captured_at',
          'latitude',
          'longitude',
          'is_cover',
          'position',
          'diagnostics',
          'created_at',
          'updated_at',
        ])
        const [
          id,
          draftKey,
          journeyId,
          entryId,
          status,
          localUri,
          thumbUri,
          mimeType,
          width,
          height,
          byteSize,
          capturedAt,
          latitude,
          longitude,
          isCover,
          position,
          diagnostics,
          createdAt,
          updatedAt,
        ] = params as [
          string,
          string,
          string,
          string | null,
          string,
          string,
          string | null,
          string,
          number,
          number,
          number | null,
          string | null,
          number | null,
          number | null,
          number,
          number,
          string,
          string,
          string,
        ]
        const existing = table.rows.get(id)
        table.rows.set(id, {
          byte_size: byteSize,
          captured_at: capturedAt,
          created_at: existing?.created_at ?? createdAt,
          diagnostics,
          draft_key: draftKey,
          entry_id:
            entryId ??
            (sql.includes('ON CONFLICT')
              ? ((existing?.entry_id) ?? null)
              : entryId),
          height,
          id,
          is_cover: isCover,
          journey_id: journeyId,
          latitude,
          local_uri: localUri,
          longitude,
          mime_type: mimeType,
          position,
          status,
          thumb_uri: thumbUri,
          updated_at: updatedAt,
          width,
        })
        return { changes: 1 }
      }

      if (sql.includes('INSERT INTO local_moments')) {
        const table = ensureTable('local_moments', [
          'id',
          'journey_id',
          'space_id',
          'creator_id',
          'title',
          'body',
          'type',
          'language',
          'visibility',
          'event_at',
          'slug',
          'stage_id',
          'stop_id',
          'latitude',
          'longitude',
          'location_title',
          'sync_status',
          'created_at',
          'updated_at',
        ])
        const [
          id,
          journeyId,
          spaceId,
          creatorId,
          title,
          body,
          type,
          language,
          visibility,
          eventAt,
          slug,
          stageId,
          stopId,
          latitude,
          longitude,
          locationTitle,
          syncStatus,
          createdAt,
          updatedAt,
        ] = params
        table.rows.set(String(id), {
          body,
          created_at: createdAt,
          creator_id: creatorId,
          event_at: eventAt,
          id,
          journey_id: journeyId,
          language,
          latitude,
          location_title: locationTitle,
          longitude,
          slug,
          space_id: spaceId,
          stage_id: stageId,
          stop_id: stopId,
          sync_status: syncStatus,
          title,
          type,
          updated_at: updatedAt,
          visibility,
        })
        return { changes: 1 }
      }

      if (sql.includes('INSERT INTO journey_content_cache')) {
        const table = ensureTable('journey_content_cache', [
          'journey_id',
          'payload',
          'cached_at',
        ])
        const [journeyId, payload, cachedAt] = params
        table.rows.set(String(journeyId), {
          cached_at: cachedAt,
          journey_id: journeyId,
          payload,
        })
        return { changes: 1 }
      }

      if (sql.includes('DELETE FROM moment_draft_photos WHERE id = ?')) {
        const table = tables.get('moment_draft_photos')
        const id = String(params[0])
        const existed = table?.rows.delete(id) === true
        return { changes: existed ? 1 : 0 }
      }

      if (
        sql.includes('DELETE FROM moment_draft_photos') &&
        sql.includes('draft_key = ?')
      ) {
        const table = tables.get('moment_draft_photos')
        if (table === undefined) {
          return { changes: 0 }
        }
        const draftKey = String(params[0])
        let changes = 0
        for (const [id, row] of [...table.rows.entries()]) {
          if (row.draft_key !== draftKey) {
            continue
          }
          if (sql.includes("status = 'enqueued'") && row.status !== 'enqueued') {
            continue
          }
          table.rows.delete(id)
          changes += 1
        }
        return { changes }
      }

      if (
        sql.includes('UPDATE moment_draft_photos') &&
        sql.includes("status = 'enqueued'")
      ) {
        const table = tables.get('moment_draft_photos')
        const entryId = params[0]
        const updatedAt = params[1]
        const photoId = String(params[2])
        const row = table?.rows.get(photoId)
        if (row !== undefined) {
          row.status = 'enqueued'
          row.entry_id = entryId
          row.updated_at = updatedAt
          return { changes: 1 }
        }
        return { changes: 0 }
      }

      if (
        sql.includes('UPDATE moment_draft_photos SET is_cover = 0')
      ) {
        const table = tables.get('moment_draft_photos')
        const draftKey = String(params[1])
        let changes = 0
        if (table !== undefined) {
          for (const row of table.rows.values()) {
            if (row.draft_key === draftKey) {
              row.is_cover = 0
              row.updated_at = params[0]
              changes += 1
            }
          }
        }
        return { changes }
      }

      if (
        sql.includes('UPDATE moment_draft_photos SET is_cover = 1')
      ) {
        const table = tables.get('moment_draft_photos')
        const photoId = String(params[1])
        const row = table?.rows.get(photoId)
        if (row !== undefined) {
          row.is_cover = 1
          row.updated_at = params[0]
          return { changes: 1 }
        }
        return { changes: 0 }
      }

      if (
        sql.includes('UPDATE moment_draft_photos') &&
        sql.includes('SET draft_key = ?')
      ) {
        const table = tables.get('moment_draft_photos')
        const toKey = String(params[0])
        const entryId = params[1]
        const updatedAt = params[2]
        const fromKey = String(params[3])
        let changes = 0
        if (table !== undefined) {
          for (const row of table.rows.values()) {
            if (row.draft_key === fromKey) {
              row.draft_key = toKey
              row.entry_id = entryId
              row.updated_at = updatedAt
              changes += 1
            }
          }
        }
        return { changes }
      }

      if (
        sql.includes('UPDATE moment_draft_photos') &&
        sql.includes('SET entry_id = ?')
      ) {
        const table = tables.get('moment_draft_photos')
        const entryId = params[0]
        const updatedAt = params[1]
        const draftKey = String(params[2])
        let changes = 0
        if (table !== undefined) {
          for (const row of table.rows.values()) {
            if (row.draft_key === draftKey) {
              row.entry_id = entryId
              row.updated_at = updatedAt
              changes += 1
            }
          }
        }
        return { changes }
      }

      if (sql.includes('UPDATE local_moments SET sync_status')) {
        const table = tables.get('local_moments')
        const syncStatus = params[0]
        const updatedAt = params[1]
        const id = String(params[2])
        const row = table?.rows.get(id)
        if (row !== undefined) {
          row.sync_status = syncStatus
          row.updated_at = updatedAt
          return { changes: 1 }
        }
        return { changes: 0 }
      }

      if (sql.includes('DELETE FROM local_moments WHERE id = ?')) {
        const table = tables.get('local_moments')
        const existed = table?.rows.delete(String(params[0])) === true
        return { changes: existed ? 1 : 0 }
      }

      if (sql.includes('DELETE FROM journey_content_cache WHERE journey_id = ?')) {
        const table = tables.get('journey_content_cache')
        const existed = table?.rows.delete(String(params[0])) === true
        return { changes: existed ? 1 : 0 }
      }

      if (sql.includes('INSERT INTO _schema_migrations')) {
        const table = ensureTable('_schema_migrations', [
          'id',
          'name',
          'applied_at',
        ])
        const [id, name, appliedAt] = params as [number, string, string]
        table.rows.set(String(id), { applied_at: appliedAt, id, name })
        return { changes: 1 }
      }

      if (sql.includes('INSERT INTO journey_cache')) {
        const table = ensureTable('journey_cache', [
          'id',
          'payload',
          'cached_at',
        ])
        const [id, payload, cachedAt] = params as [string, string, string]
        table.rows.set(id, { cached_at: cachedAt, id, payload })
        return { changes: 1 }
      }

      if (sql.includes('INSERT INTO journey_list_cache')) {
        const table = ensureTable('journey_list_cache', [
          'user_id',
          'space_id',
          'journey_id',
          'payload',
          'sort_order',
          'cached_at',
        ])
        const [userId, spaceId, journeyId, payload, sortOrder, cachedAt] =
          params as [string, string, string, string, number, string]
        table.rows.set(`${userId}:${spaceId}:${journeyId}`, {
          cached_at: cachedAt,
          journey_id: journeyId,
          payload,
          sort_order: sortOrder,
          space_id: spaceId,
          user_id: userId,
        })
        return { changes: 1 }
      }

      if (sql.includes('INSERT INTO journey_stop_cache')) {
        const table = ensureTable('journey_stop_cache', [
          'user_id',
          'journey_id',
          'payload',
          'cached_at',
        ])
        const [userId, journeyId, payload, cachedAt] = params as [
          string,
          string,
          string,
          string,
        ]
        table.rows.set(`${userId}:${journeyId}`, {
          cached_at: cachedAt,
          journey_id: journeyId,
          payload,
          user_id: userId,
        })
        return { changes: 1 }
      }

      if (sql.includes('INSERT INTO sync_queue')) {
        const table = ensureTable('sync_queue', [
          'id',
          'operation_type',
          'payload',
          'status',
          'created_at',
          'status_updated_at',
        ])
        const [id, operationType, payload, createdAt, statusUpdatedAt] =
          params as [string, string, string, string, string]
        table.rows.set(id, {
          created_at: createdAt,
          id,
          operation_type: operationType,
          payload,
          status: 'pending',
          status_updated_at: statusUpdatedAt,
        })
        return { changes: 1 }
      }

      if (
        sql.includes('UPDATE sync_queue SET status_updated_at = created_at')
      ) {
        const table = tables.get('sync_queue')
        if (table === undefined) {
          return { changes: 0 }
        }

        let changes = 0
        for (const row of table.rows.values()) {
          const current = row.status_updated_at
          if (current === '' || current === null) {
            row.status_updated_at = row.created_at
            changes += 1
          }
        }

        return { changes }
      }

      if (
        sql.includes("SET status = 'pending', status_updated_at = ?") &&
        sql.includes('payload = ?')
      ) {
        const [statusUpdatedAt, payload, id] = params as [
          string,
          string,
          string,
        ]
        const row = tables.get('sync_queue')?.rows.get(id)
        if (row !== undefined) {
          row.status = 'pending'
          row.status_updated_at = statusUpdatedAt
          row.payload = payload
        }
        return { changes: row === undefined ? 0 : 1 }
      }

      if (
        sql.includes("SET status = 'pending', status_updated_at") &&
        sql.includes("status = 'processing'")
      ) {
        const [now, cutoff, ...excludes] = params as [
          string,
          string,
          ...string[],
        ]
        const table = tables.get('sync_queue')
        if (table === undefined) {
          return { changes: 0 }
        }

        let changes = 0
        for (const row of table.rows.values()) {
          if (row.status !== 'processing') {
            continue
          }

          if (String(row.status_updated_at) >= cutoff) {
            continue
          }

          if (excludes.includes(String(row.id))) {
            continue
          }

          row.status = 'pending'
          row.status_updated_at = now
          changes += 1
        }

        return { changes }
      }

      if (sql.includes('UPDATE sync_queue SET status')) {
        const [status, statusUpdatedAt, id] = params as [string, string, string]
        const row = tables.get('sync_queue')?.rows.get(id)
        if (row !== undefined) {
          row.status = status
          row.status_updated_at = statusUpdatedAt
        }
        return { changes: row === undefined ? 0 : 1 }
      }

      if (sql.includes('UPDATE sync_queue SET payload')) {
        const [payload, statusUpdatedAt, id] = params as [
          string,
          string,
          string,
        ]
        const row = tables.get('sync_queue')?.rows.get(id)
        if (row !== undefined) {
          row.payload = payload
          row.status_updated_at = statusUpdatedAt
        }
        return { changes: row === undefined ? 0 : 1 }
      }

      if (sql.includes('DELETE FROM journey_cache')) {
        const table = tables.get('journey_cache')
        const [id] = params as [string]
        const existed = table?.rows.delete(id) ?? false
        return { changes: existed ? 1 : 0 }
      }

      if (
        sql.includes(
          'DELETE FROM journey_list_cache WHERE user_id = ? AND space_id = ? AND journey_id = ?',
        )
      ) {
        const table = tables.get('journey_list_cache')
        const [userId, spaceId, journeyId] = params as [string, string, string]
        const existed =
          table?.rows.delete(`${userId}:${spaceId}:${journeyId}`) ?? false
        return { changes: existed ? 1 : 0 }
      }

      if (
        sql.includes(
          'DELETE FROM journey_list_cache WHERE user_id = ? AND space_id = ?',
        )
      ) {
        const table = tables.get('journey_list_cache')
        const [userId, spaceId] = params as [string, string]
        if (table === undefined) {
          return { changes: 0 }
        }

        let changes = 0
        for (const [key, row] of table.rows.entries()) {
          const rowSpaceId =
            typeof row.space_id === 'string' ? row.space_id : ''
          if (row.user_id === userId && rowSpaceId === spaceId) {
            table.rows.delete(key)
            changes += 1
          }
        }

        return { changes }
      }

      if (sql.includes('DELETE FROM journey_list_cache WHERE user_id = ?')) {
        const table = tables.get('journey_list_cache')
        const [userId] = params as [string]
        if (table === undefined) {
          return { changes: 0 }
        }

        let changes = 0
        for (const [key, row] of table.rows.entries()) {
          if (row.user_id === userId) {
            table.rows.delete(key)
            changes += 1
          }
        }

        return { changes }
      }

      if (sql.includes('DELETE FROM journey_stop_cache WHERE user_id = ?')) {
        const table = tables.get('journey_stop_cache')
        const [userId, journeyId] = params as [string, string]
        const existed = table?.rows.delete(`${userId}:${journeyId}`) ?? false
        return { changes: existed ? 1 : 0 }
      }

      return { changes: 0 }
    },

    async withTransactionAsync(task) {
      await task()
    },
  }

  return db
}
