import { createPublicSlug } from '@trip-diary/utils'
import {
  getLocalMoment,
  setLocalMomentSyncStatus,
  type LocalMomentRecord,
} from '@/platform/storage/local-moments'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export const ENTRY_CREATE_OPERATION = 'entry.create'
export const ENTRY_UPDATE_OPERATION = 'entry.update'

export function entryCreateOperationId(entryId: string): string {
  return `entry-create-${entryId}`
}

export function entryUpdateOperationId(entryId: string): string {
  return `entry-update-${entryId}`
}

export class EntrySyncError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'EntrySyncError'
    this.retryable = retryable
  }
}

export async function processEntryCreateOperation(
  payload: Record<string, unknown>,
): Promise<{ entryId: string }> {
  if (!isSupabaseConfigured()) {
    throw new EntrySyncError('Supabase is not configured.', false)
  }

  const entryId = requireString(payload.entryId, 'entryId')
  const local = await getLocalMoment(entryId)
  const source = local ?? momentFromPayload(payload)

  await setLocalMomentSyncStatus(entryId, 'syncing')

  const client = getSupabaseClient()
  const slug = source.slug ?? createPublicSlug(source.title, source.id)

  const { error: entryError } = await client.from('entries').insert({
    body: source.body,
    creator_id: source.creatorId,
    event_at: source.eventAt,
    id: source.id,
    language: source.language,
    slug,
    space_id: source.spaceId,
    status: 'published',
    title: source.title,
    type: source.type,
    visibility: source.visibility,
  })

  if (entryError !== null && !isDuplicateKeyError(entryError)) {
    await setLocalMomentSyncStatus(entryId, 'failed')
    throw new EntrySyncError(entryError.message, true)
  }

  const rpcInput: Record<string, unknown> = {
    p_entry_id: source.id,
    p_journey_id: source.journeyId,
  }
  if (source.stageId !== null) {
    rpcInput.p_stage_id = source.stageId
  }
  if (source.stopId !== null) {
    rpcInput.p_stop_id = source.stopId
  }
  if (source.locationTitle !== null && source.locationTitle.trim().length > 0) {
    rpcInput.p_location_title = source.locationTitle.trim()
  }
  if (
    source.latitude !== null &&
    source.longitude !== null &&
    Number.isFinite(source.latitude) &&
    Number.isFinite(source.longitude)
  ) {
    rpcInput.p_latitude = source.latitude
    rpcInput.p_longitude = source.longitude
  }

  const { error: assignmentError } = await client.rpc(
    'upsert_journey_moment_assignment',
    rpcInput,
  )

  if (assignmentError !== null) {
    await setLocalMomentSyncStatus(entryId, 'failed')
    throw new EntrySyncError(assignmentError.message, true)
  }

  await setLocalMomentSyncStatus(entryId, 'synced')
  return { entryId }
}

export async function processEntryUpdateOperation(
  payload: Record<string, unknown>,
): Promise<{ entryId: string }> {
  if (!isSupabaseConfigured()) {
    throw new EntrySyncError('Supabase is not configured.', false)
  }

  const entryId = requireString(payload.entryId, 'entryId')
  const local = await getLocalMoment(entryId)
  if (local === null) {
    // Nothing local to push — treat as complete.
    return { entryId }
  }

  await setLocalMomentSyncStatus(entryId, 'syncing')
  const client = getSupabaseClient()

  const { error } = await client.rpc('update_entry', {
    p_body: local.body,
    p_event_at: local.eventAt,
    p_expected_version: 1,
    p_id: local.id,
    p_language: local.language,
    p_latitude: null,
    p_longitude: null,
    p_status: 'published',
    p_title: local.title,
    p_type: local.type,
    p_visibility: local.visibility,
  })

  if (error !== null) {
    await setLocalMomentSyncStatus(entryId, 'failed')
    throw new EntrySyncError(error.message, true)
  }

  const rpcInput: Record<string, unknown> = {
    p_entry_id: local.id,
    p_journey_id: local.journeyId,
    p_stage_id: local.stageId,
    p_stop_id: local.stopId,
  }
  if (
    local.latitude !== null &&
    local.longitude !== null &&
    Number.isFinite(local.latitude) &&
    Number.isFinite(local.longitude)
  ) {
    rpcInput.p_latitude = local.latitude
    rpcInput.p_longitude = local.longitude
  }
  if (local.locationTitle !== null) {
    rpcInput.p_location_title = local.locationTitle
  }

  const { error: assignmentError } = await client.rpc(
    'upsert_journey_moment_assignment',
    rpcInput,
  )
  if (assignmentError !== null) {
    await setLocalMomentSyncStatus(entryId, 'failed')
    throw new EntrySyncError(assignmentError.message, true)
  }

  await setLocalMomentSyncStatus(entryId, 'synced')
  return { entryId }
}

function momentFromPayload(
  payload: Record<string, unknown>,
): LocalMomentRecord {
  const id = requireString(payload.entryId, 'entryId')
  const now = new Date().toISOString()
  return {
    body: typeof payload.body === 'string' ? payload.body : '',
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : now,
    creatorId: requireString(payload.creatorId, 'creatorId'),
    eventAt: typeof payload.eventAt === 'string' ? payload.eventAt : null,
    id,
    journeyId: requireString(payload.journeyId, 'journeyId'),
    language: payload.language === 'en' ? 'en' : 'cs',
    latitude: typeof payload.latitude === 'number' ? payload.latitude : null,
    locationTitle:
      typeof payload.locationTitle === 'string' ? payload.locationTitle : null,
    longitude: typeof payload.longitude === 'number' ? payload.longitude : null,
    slug: typeof payload.slug === 'string' ? payload.slug : null,
    spaceId: requireString(payload.spaceId, 'spaceId'),
    stageId: typeof payload.stageId === 'string' ? payload.stageId : null,
    stopId: typeof payload.stopId === 'string' ? payload.stopId : null,
    syncStatus: 'pending',
    title: typeof payload.title === 'string' ? payload.title : '',
    type:
      payload.type === 'tip' ||
      payload.type === 'note' ||
      payload.type === 'place' ||
      payload.type === 'story'
        ? payload.type
        : 'story',
    updatedAt: now,
    visibility:
      payload.visibility === 'private' || payload.visibility === 'unlisted'
        ? payload.visibility
        : 'public',
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new EntrySyncError(`Missing ${field} in entry sync payload.`, false)
  }
  return value
}

function isDuplicateKeyError(error: { message?: string }): boolean {
  return (error.message ?? '').toLowerCase().includes('duplicate')
}
