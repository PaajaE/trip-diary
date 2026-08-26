import {
  createEntrySchema,
  type CreateEntryInput,
} from '@trip-diary/core/entry'
import { createPublicSlug } from '@trip-diary/utils'
import type { JourneyEntry } from '@/features/journeys/model/journey-detail'
import { createUuid } from '@/platform/id'
import {
  getLocalMoment,
  localMomentToJourneyEntry,
} from '@/platform/storage/local-moments'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export class EntryRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EntryRepositoryError'
  }
}

function requireClient() {
  if (!isSupabaseConfigured()) {
    throw new EntryRepositoryError('Supabase is not configured.')
  }

  return getSupabaseClient()
}

export function createEntryId(): string {
  return createUuid()
}

export function createStopId(): string {
  return createEntryId()
}

export interface CreateJourneyMomentInput {
  body: string
  creatorId: string
  entryId?: string
  eventAt: string
  journeyId: string
  language: 'cs' | 'en'
  latitude: number | null
  locationTitle: string | null
  longitude: number | null
  spaceId: string
  stageId: string | null
  stopId?: string | null
  title: string
  type: CreateEntryInput['type']
  visibility: CreateEntryInput['visibility']
}

export async function createJourneyMoment(
  input: CreateJourneyMomentInput,
): Promise<{ entryId: string; stopId: string | null }> {
  const validInput = createEntrySchema.parse({
    body: input.body,
    eventAt: input.eventAt,
    language: input.language,
    title: input.title,
    type: input.type,
    visibility: input.visibility,
  })

  const entryId = input.entryId ?? createEntryId()
  const hasLocation =
    input.latitude !== null &&
    input.longitude !== null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  const stopId = hasLocation ? (input.stopId ?? createStopId()) : null
  const slug = createPublicSlug(validInput.title, entryId)
  const client = requireClient()

  const { error: entryError } = await client.from('entries').insert({
    body: validInput.body,
    creator_id: input.creatorId,
    event_at: validInput.eventAt,
    id: entryId,
    language: validInput.language,
    slug,
    space_id: input.spaceId,
    status: 'published',
    title: validInput.title,
    type: validInput.type,
    visibility: validInput.visibility,
  })

  if (entryError !== null) {
    if (!isDuplicateKeyError(entryError)) {
      throw new EntryRepositoryError(entryError.message)
    }
  }

  const rpcInput: Record<string, unknown> = {
    p_entry_id: entryId,
    p_journey_id: input.journeyId,
  }

  if (input.stageId !== null) {
    rpcInput.p_stage_id = input.stageId
  }

  if (stopId !== null) {
    rpcInput.p_stop_id = stopId
  }

  if (input.locationTitle !== null && input.locationTitle.trim().length > 0) {
    rpcInput.p_location_title = input.locationTitle.trim()
  }

  if (hasLocation) {
    rpcInput.p_latitude = input.latitude
    rpcInput.p_longitude = input.longitude
  }

  const { error: assignmentError } = await client.rpc(
    'upsert_journey_moment_assignment',
    rpcInput,
  )

  if (assignmentError !== null) {
    throw new EntryRepositoryError(assignmentError.message)
  }

  return { entryId, stopId }
}

export async function updateJourneyMoment(
  entryId: string,
  input: CreateEntryInput & { expectedVersion?: number },
): Promise<void> {
  const validInput = createEntrySchema.parse(input)
  const client = requireClient()

  const { error } = await client.rpc('update_entry', {
    p_body: validInput.body,
    p_event_at: validInput.eventAt,
    p_expected_version: input.expectedVersion ?? 1,
    p_id: entryId,
    p_language: validInput.language,
    p_latitude: null,
    p_longitude: null,
    p_status: 'published',
    p_title: validInput.title,
    p_type: validInput.type,
    p_visibility: validInput.visibility,
  })

  if (error !== null) {
    throw new EntryRepositoryError(error.message)
  }
}

export async function deleteJourneyMoment(entryId: string): Promise<void> {
  const { error } = await requireClient()
    .from('entries')
    .delete()
    .eq('id', entryId)

  if (error !== null) {
    throw new EntryRepositoryError(error.message)
  }
}

export async function moveJourneyMomentToStage(input: {
  entryId: string
  journeyId: string
  latitude?: number | null
  locationTitle?: string | null
  longitude?: number | null
  stageId: string | null
  stopId?: string | null
}): Promise<void> {
  const client = requireClient()
  const rpcInput: Record<string, unknown> = {
    p_entry_id: input.entryId,
    p_journey_id: input.journeyId,
    p_stage_id: input.stageId,
    p_stop_id: input.stopId ?? null,
  }

  if (
    input.latitude !== null &&
    input.latitude !== undefined &&
    input.longitude !== null &&
    input.longitude !== undefined
  ) {
    rpcInput.p_latitude = input.latitude
    rpcInput.p_longitude = input.longitude
  }

  if (input.locationTitle !== null && input.locationTitle !== undefined) {
    rpcInput.p_location_title = input.locationTitle
  }

  const { error } = await client.rpc(
    'upsert_journey_moment_assignment',
    rpcInput,
  )

  if (error !== null) {
    throw new EntryRepositoryError(error.message)
  }
}

function parseEntryType(value: unknown): JourneyEntry['type'] {
  if (
    value === 'tip' ||
    value === 'note' ||
    value === 'place' ||
    value === 'story'
  ) {
    return value
  }

  return 'story'
}

export async function fetchJourneyEntry(
  entryId: string,
): Promise<JourneyEntry | null> {
  const local = await getLocalMoment(entryId)
  if (
    local !== null &&
    (local.syncStatus === 'pending' ||
      local.syncStatus === 'syncing' ||
      local.syncStatus === 'failed')
  ) {
    return localMomentToJourneyEntry(local)
  }

  if (!isSupabaseConfigured()) {
    return local !== null ? localMomentToJourneyEntry(local) : null
  }

  try {
    const client = getSupabaseClient()
    const { data: entry, error: entryError } = await client
      .from('entries')
      .select('id, title, body, type, event_at, created_at, slug')
      .eq('id', entryId)
      .maybeSingle()

    if (entryError !== null) {
      if (local !== null) {
        return localMomentToJourneyEntry(local)
      }
      throw new EntryRepositoryError(entryError.message)
    }

    if (entry === null) {
      return local !== null ? localMomentToJourneyEntry(local) : null
    }

    const { data: link, error: linkError } = await client
      .from('entry_journey_links')
      .select('stage_id, stop_id')
      .eq('entry_id', entryId)
      .maybeSingle()

    if (linkError !== null) {
      if (local !== null) {
        return localMomentToJourneyEntry(local)
      }
      throw new EntryRepositoryError(linkError.message)
    }

    const remote: JourneyEntry = {
      body: typeof entry.body === 'string' ? entry.body : '',
      coverPreviewUrl: null,
      createdAt: typeof entry.created_at === 'string' ? entry.created_at : null,
      eventAt: typeof entry.event_at === 'string' ? entry.event_at : null,
      id: String(entry.id),
      slug: typeof entry.slug === 'string' ? entry.slug : null,
      stageId: typeof link?.stage_id === 'string' ? link.stage_id : null,
      stopId: typeof link?.stop_id === 'string' ? link.stop_id : null,
      title: typeof entry.title === 'string' ? entry.title : null,
      type: parseEntryType(entry.type),
    }

    if (
      local !== null &&
      (local.syncStatus === 'pending' ||
        local.syncStatus === 'syncing' ||
        local.syncStatus === 'failed')
    ) {
      return localMomentToJourneyEntry(local, remote.coverPreviewUrl)
    }

    return remote
  } catch (error) {
    if (local !== null) {
      return localMomentToJourneyEntry(local)
    }
    throw error
  }
}

function isDuplicateKeyError(error: { message?: string }): boolean {
  return (error.message ?? '').toLowerCase().includes('duplicate')
}
