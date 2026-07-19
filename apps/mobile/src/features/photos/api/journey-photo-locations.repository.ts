import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'
import { readMeaningfulPhotoGps } from '@/features/photos/lib/read-photo-coordinate'

export interface JourneyPhotoLocation {
  entryId: string
  entryTitle: string | null
  id: string
  latitude: number
  longitude: number
}

export async function listJourneyPhotoLocations(
  entryIds: string[],
  entryTitles: Map<string, string | null> = new Map(),
): Promise<JourneyPhotoLocation[]> {
  if (entryIds.length === 0 || !isSupabaseConfigured()) {
    return []
  }

  const client = getSupabaseClient()
  const uniqueEntryIds = [...new Set(entryIds)]

  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('entry_id, photo_id')
    .in('entry_id', uniqueEntryIds)

  if (linksError !== null) {
    throw new Error(linksError.message)
  }

  if (links.length === 0) {
    return []
  }

  const photoIds = [...new Set(links.map((link) => String(link.photo_id)))]
  const { data: photos, error: photosError } = await client
    .from('photos')
    .select('id, latitude, longitude')
    .in('id', photoIds)

  if (photosError !== null) {
    throw new Error(photosError.message)
  }

  const entryIdByPhotoId = new Map(
    links.map((link) => [String(link.photo_id), String(link.entry_id)]),
  )

  const byPhotoId = new Map<string, JourneyPhotoLocation>()

  for (const photo of photos) {
    const photoId = String(photo.id)
    if (byPhotoId.has(photoId)) {
      continue
    }

    const entryId = entryIdByPhotoId.get(photoId)
    const coords = readMeaningfulPhotoGps(photo.latitude, photo.longitude)

    if (entryId === undefined || coords === null) {
      continue
    }

    byPhotoId.set(photoId, {
      entryId,
      entryTitle: entryTitles.get(entryId) ?? null,
      id: photoId,
      latitude: coords.latitude,
      longitude: coords.longitude,
    })
  }

  return [...byPhotoId.values()]
}
