import type { JourneyEntry } from '@/features/journeys/model/journey-detail'
import { getMobileDatabase } from '@/platform/storage/database'

export type LocalMomentSyncStatus =
  | 'failed'
  | 'pending'
  | 'synced'
  | 'syncing'

export interface LocalMomentRecord {
  body: string
  createdAt: string
  creatorId: string
  eventAt: string | null
  id: string
  journeyId: string
  language: 'cs' | 'en'
  latitude: number | null
  locationTitle: string | null
  longitude: number | null
  slug: string | null
  spaceId: string
  stageId: string | null
  stopId: string | null
  syncStatus: LocalMomentSyncStatus
  title: string
  type: JourneyEntry['type']
  updatedAt: string
  visibility: 'private' | 'public' | 'unlisted'
}

export async function upsertLocalMoment(
  record: LocalMomentRecord,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    `INSERT INTO local_moments (
       id, journey_id, space_id, creator_id, title, body, type, language,
       visibility, event_at, slug, stage_id, stop_id, latitude, longitude,
       location_title, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       journey_id = excluded.journey_id,
       space_id = excluded.space_id,
       creator_id = excluded.creator_id,
       title = excluded.title,
       body = excluded.body,
       type = excluded.type,
       language = excluded.language,
       visibility = excluded.visibility,
       event_at = excluded.event_at,
       slug = excluded.slug,
       stage_id = excluded.stage_id,
       stop_id = excluded.stop_id,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       location_title = excluded.location_title,
       sync_status = excluded.sync_status,
       updated_at = excluded.updated_at`,
    record.id,
    record.journeyId,
    record.spaceId,
    record.creatorId,
    record.title,
    record.body,
    record.type,
    record.language,
    record.visibility,
    record.eventAt,
    record.slug,
    record.stageId,
    record.stopId,
    record.latitude,
    record.longitude,
    record.locationTitle,
    record.syncStatus,
    record.createdAt,
    record.updatedAt,
  )
}

export async function getLocalMoment(
  entryId: string,
): Promise<LocalMomentRecord | null> {
  const db = await getMobileDatabase()
  const row = await db.getFirstAsync<LocalMomentRow>(
    `SELECT * FROM local_moments WHERE id = ?`,
    entryId,
  )
  return row === null ? null : mapRow(row)
}

export async function listLocalMomentsForJourney(
  journeyId: string,
): Promise<LocalMomentRecord[]> {
  const db = await getMobileDatabase()
  const rows = await db.getAllAsync<LocalMomentRow>(
    `SELECT * FROM local_moments WHERE journey_id = ?`,
    journeyId,
  )
  return rows.map(mapRow)
}

export async function listUnsyncedLocalMomentsForJourney(
  journeyId: string,
): Promise<LocalMomentRecord[]> {
  const rows = await listLocalMomentsForJourney(journeyId)
  return rows.filter((row) => row.syncStatus !== 'synced')
}

export async function setLocalMomentSyncStatus(
  entryId: string,
  syncStatus: LocalMomentSyncStatus,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    `UPDATE local_moments SET sync_status = ?, updated_at = ? WHERE id = ?`,
    syncStatus,
    new Date().toISOString(),
    entryId,
  )
}

export async function deleteLocalMoment(entryId: string): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(`DELETE FROM local_moments WHERE id = ?`, entryId)
}

export function localMomentToJourneyEntry(
  moment: LocalMomentRecord,
  coverPreviewUrl: string | null = null,
): JourneyEntry {
  return {
    body: moment.body,
    coverPreviewUrl,
    createdAt: moment.createdAt,
    eventAt: moment.eventAt,
    id: moment.id,
    slug: moment.slug,
    stageId: moment.stageId,
    stopId: moment.stopId,
    title: moment.title,
    type: moment.type,
  }
}

interface LocalMomentRow {
  body: string
  created_at: string
  creator_id: string
  event_at: string | null
  id: string
  journey_id: string
  language: string
  latitude: number | null
  location_title: string | null
  longitude: number | null
  slug: string | null
  space_id: string
  stage_id: string | null
  stop_id: string | null
  sync_status: string
  title: string
  type: string
  updated_at: string
  visibility: string
}

function mapRow(row: LocalMomentRow): LocalMomentRecord {
  const language: 'cs' | 'en' = row.language === 'en' ? 'en' : 'cs'
  const visibility =
    row.visibility === 'private' || row.visibility === 'unlisted'
      ? row.visibility
      : 'public'
  const type: JourneyEntry['type'] =
    row.type === 'tip' ||
    row.type === 'note' ||
    row.type === 'place' ||
    row.type === 'story'
      ? row.type
      : 'story'
  const syncStatus: LocalMomentSyncStatus =
    row.sync_status === 'synced' ||
    row.sync_status === 'syncing' ||
    row.sync_status === 'failed'
      ? row.sync_status
      : 'pending'

  return {
    body: row.body,
    createdAt: row.created_at,
    creatorId: row.creator_id,
    eventAt: row.event_at,
    id: row.id,
    journeyId: row.journey_id,
    language,
    latitude: row.latitude,
    locationTitle: row.location_title,
    longitude: row.longitude,
    slug: row.slug,
    spaceId: row.space_id,
    stageId: row.stage_id,
    stopId: row.stop_id,
    syncStatus,
    title: row.title,
    type,
    updatedAt: row.updated_at,
    visibility,
  }
}
