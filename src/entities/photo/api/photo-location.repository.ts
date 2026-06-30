import { getMeaningfulGpsCoordinates } from '@/entities/photo/lib/photo-exif-gps'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { isBrowserOnline } from '@/shared/lib/network'

export interface JourneyPhotoLocation {
  entryId: string
  entryTitle: string | null
  id: string
  latitude: number
  longitude: number
}

export interface JourneyPhotoLocationMoment {
  entry: {
    id: string
    title: string | null
  }
}

export async function getJourneyPhotoLocations(
  moments: JourneyPhotoLocationMoment[],
): Promise<JourneyPhotoLocation[]> {
  const entryIds = [...new Set(moments.map((moment) => moment.entry.id))]
  if (entryIds.length === 0) {
    return []
  }

  const titlesByEntryId = new Map(
    moments.map((moment) => [moment.entry.id, moment.entry.title]),
  )
  const localLocations = await listLocalPhotoLocations(
    entryIds,
    titlesByEntryId,
  )
  let remoteLocations: JourneyPhotoLocation[] = []
  if (isBrowserOnline()) {
    try {
      remoteLocations = await listRemotePhotoLocations(
        entryIds,
        titlesByEntryId,
      )
    } catch {
      // Keep local-only results when the remote fetch fails offline or errors.
    }
  }

  const locationsById = new Map<string, JourneyPhotoLocation>()
  for (const location of remoteLocations) {
    locationsById.set(location.id, location)
  }
  for (const location of localLocations) {
    locationsById.set(location.id, location)
  }

  return [...locationsById.values()]
}

async function listLocalPhotoLocations(
  entryIds: string[],
  titlesByEntryId: Map<string, string | null>,
): Promise<JourneyPhotoLocation[]> {
  const photos = await localDb.photos.where('entryId').anyOf(entryIds).toArray()

  return photos.flatMap((photo) => {
    const coords = getMeaningfulGpsCoordinates(photo.latitude, photo.longitude)
    if (coords === null) {
      return []
    }

    return [
      {
        entryId: photo.entryId,
        entryTitle: titlesByEntryId.get(photo.entryId) ?? null,
        id: photo.id,
        ...coords,
      },
    ]
  })
}

async function listRemotePhotoLocations(
  entryIds: string[],
  titlesByEntryId: Map<string, string | null>,
): Promise<JourneyPhotoLocation[]> {
  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('entry_id, photo_id')
    .in('entry_id', entryIds)

  if (linksError !== null) {
    throw linksError
  }
  if (links.length === 0) {
    return []
  }

  const photoIds = [...new Set(links.map((link) => link.photo_id))]
  const { data: photos, error: photosError } = await client
    .from('photos')
    .select('id, latitude, longitude')
    .in('id', photoIds)

  if (photosError !== null) {
    throw photosError
  }

  const entryIdByPhotoId = new Map(
    links.map((link) => [link.photo_id, link.entry_id]),
  )

  return photos.flatMap((photo) => {
    const entryId = entryIdByPhotoId.get(photo.id)
    const coords = getMeaningfulGpsCoordinates(photo.latitude, photo.longitude)
    if (entryId === undefined || coords === null) {
      return []
    }

    return [
      {
        entryId,
        entryTitle: titlesByEntryId.get(entryId) ?? null,
        id: photo.id,
        ...coords,
      },
    ]
  })
}
