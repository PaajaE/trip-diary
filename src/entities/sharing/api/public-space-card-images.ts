import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/api/database.types'

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

type TypedSupabaseClient = SupabaseClient<Database>

export interface PublicSpaceCardImages {
  entryImageById: Record<string, string>
  journeyCoverById: Record<string, string>
}

export async function loadPublicSpaceCardImages(
  client: TypedSupabaseClient,
  journeyIds: string[],
  diaryEntryIds: string[],
): Promise<PublicSpaceCardImages> {
  const journeyCoverById: Record<string, string> = {}
  const entryImageById: Record<string, string> = {}

  if (journeyIds.length === 0 && diaryEntryIds.length === 0) {
    return { entryImageById, journeyCoverById }
  }

  const journeyLinksResult =
    journeyIds.length === 0
      ? { data: [], error: null }
      : await client
          .from('entry_journey_links')
          .select('journey_id, entry_id')
          .in('journey_id', journeyIds)

  if (journeyLinksResult.error !== null) {
    throw journeyLinksResult.error
  }

  const journeyLinks = journeyLinksResult.data
  const linkedEntryIds = [
    ...new Set(journeyLinks.map(({ entry_id }) => entry_id)),
  ]
  const allEntryIds = [...new Set([...diaryEntryIds, ...linkedEntryIds])]

  if (allEntryIds.length === 0) {
    return { entryImageById, journeyCoverById }
  }

  const entriesResult = await client
    .from('entries')
    .select('id, event_at')
    .in('id', allEntryIds)
    .eq('status', 'published')
    .eq('visibility', 'public')

  if (entriesResult.error !== null) {
    throw entriesResult.error
  }

  const publicEntries = entriesResult.data
  const publicEntryIds = new Set(publicEntries.map(({ id }) => id))
  const eventAtByEntryId = new Map(
    publicEntries.map(({ event_at, id }) => [id, event_at ?? '']),
  )

  const photoUrlByEntryId = await getFirstPhotoUrlByEntryIds(client, [
    ...publicEntryIds,
  ])

  for (const entryId of diaryEntryIds) {
    const url = photoUrlByEntryId.get(entryId)
    if (url !== undefined) {
      entryImageById[entryId] = url
    }
  }

  const entriesByJourneyId = new Map<string, string[]>()
  for (const link of journeyLinks) {
    if (!publicEntryIds.has(link.entry_id)) {
      continue
    }
    const entries = entriesByJourneyId.get(link.journey_id) ?? []
    entries.push(link.entry_id)
    entriesByJourneyId.set(link.journey_id, entries)
  }

  for (const journeyId of journeyIds) {
    const entryIds = entriesByJourneyId.get(journeyId) ?? []
    const sortedEntryIds = [...entryIds].sort((left, right) =>
      (eventAtByEntryId.get(right) ?? '').localeCompare(
        eventAtByEntryId.get(left) ?? '',
      ),
    )

    for (const entryId of sortedEntryIds) {
      const url = photoUrlByEntryId.get(entryId)
      if (url !== undefined) {
        journeyCoverById[journeyId] = url
        break
      }
    }
  }

  return { entryImageById, journeyCoverById }
}

async function getFirstPhotoUrlByEntryIds(
  client: TypedSupabaseClient,
  entryIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (entryIds.length === 0) {
    return result
  }

  const { data: entryPhotos, error: entryPhotosError } = await client
    .from('entry_photos')
    .select('entry_id, photo_id, position')
    .in('entry_id', entryIds)
    .order('position')

  if (entryPhotosError !== null) {
    throw entryPhotosError
  }

  const photoIdByEntryId = new Map<string, string>()
  for (const row of entryPhotos) {
    if (!photoIdByEntryId.has(row.entry_id)) {
      photoIdByEntryId.set(row.entry_id, row.photo_id)
    }
  }

  const photoIds = [...new Set(photoIdByEntryId.values())]
  if (photoIds.length === 0) {
    return result
  }

  const { data: variants, error: variantsError } = await client
    .from('photo_variants')
    .select('photo_id, storage_path, variant')
    .in('photo_id', photoIds)
    .in('variant', ['thumb', 'preview'])

  if (variantsError !== null) {
    throw variantsError
  }

  const storagePathByPhotoId = new Map<string, string>()
  for (const variant of variants) {
    const existing = storagePathByPhotoId.get(variant.photo_id)
    if (existing === undefined || variant.variant === 'thumb') {
      storagePathByPhotoId.set(variant.photo_id, variant.storage_path)
    }
  }

  const signedUrlByPhotoId = new Map<string, string>()
  await Promise.all(
    [...storagePathByPhotoId.entries()].map(async ([photoId, storagePath]) => {
      const { data, error } = await client.storage
        .from('photos')
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
      if (error === null) {
        signedUrlByPhotoId.set(photoId, data.signedUrl)
      }
    }),
  )

  for (const [entryId, photoId] of photoIdByEntryId) {
    const url = signedUrlByPhotoId.get(photoId)
    if (url !== undefined) {
      result.set(entryId, url)
    }
  }

  return result
}
