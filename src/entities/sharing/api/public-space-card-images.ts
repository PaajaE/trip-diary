import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PHOTO_SRCSET_WIDTHS,
  pickPhotoVariantForContext,
} from '@trip-diary/utils'
import type { Database } from '@/shared/api/database.types'

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

/** Profile journey cards are large; allow medium on high-DPR without fetching full. */
const JOURNEY_COVER_SRCSET_VARIANTS = new Set(['small', 'medium'])

type TypedSupabaseClient = SupabaseClient<Database>

export interface PublicSpaceCardImageSource {
  src: string
  srcSet?: string
}

export interface PublicSpaceCardImages {
  entryImageById: Record<string, string>
  journeyCoverById: Record<string, PublicSpaceCardImageSource>
}

export async function loadPublicSpaceCardImages(
  client: TypedSupabaseClient,
  journeyIds: string[],
  diaryEntryIds: string[],
): Promise<PublicSpaceCardImages> {
  const journeyCoverById: Record<string, PublicSpaceCardImageSource> = {}
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

  const photoSourcesByEntryId = await resolveEntryPhotoSources(
    client,
    [...publicEntryIds],
  )

  for (const entryId of diaryEntryIds) {
    const source = photoSourcesByEntryId.get(entryId)
    if (source !== undefined) {
      entryImageById[entryId] = source.thumbSrc
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
      const source = photoSourcesByEntryId.get(entryId)
      if (source !== undefined) {
        journeyCoverById[journeyId] = source.cover
        break
      }
    }
  }

  return { entryImageById, journeyCoverById }
}

interface PhotoVariantRow {
  photo_id: string
  storage_path: string
  variant: string
}

interface EntryPhotoSources {
  cover: PublicSpaceCardImageSource
  thumbSrc: string
}

async function resolveEntryPhotoSources(
  client: TypedSupabaseClient,
  entryIds: string[],
): Promise<Map<string, EntryPhotoSources>> {
  const result = new Map<string, EntryPhotoSources>()
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
    .in('variant', ['thumb', 'small', 'medium', 'full', 'preview', 'large'])

  if (variantsError !== null) {
    throw variantsError
  }

  const variantsByPhotoId = new Map<string, PhotoVariantRow[]>()
  for (const variant of variants) {
    const rows = variantsByPhotoId.get(variant.photo_id) ?? []
    rows.push(variant)
    variantsByPhotoId.set(variant.photo_id, rows)
  }

  const storagePaths = new Set<string>()
  for (const photoId of photoIds) {
    const photoVariants = variantsByPhotoId.get(photoId) ?? []
    const thumbPreferred = pickPhotoVariantForContext(photoVariants, 'tiny')
    const coverPreferred = pickPhotoVariantForContext(photoVariants, 'card')
    if (thumbPreferred !== null) {
      storagePaths.add(thumbPreferred.storage_path)
    }
    if (coverPreferred !== null) {
      storagePaths.add(coverPreferred.storage_path)
    }
    for (const { variant } of PHOTO_SRCSET_WIDTHS) {
      if (!JOURNEY_COVER_SRCSET_VARIANTS.has(variant)) {
        continue
      }
      const match = photoVariants.find((row) => row.variant === variant)
      if (match !== undefined) {
        storagePaths.add(match.storage_path)
      }
    }
  }

  const signedUrlByStoragePath = await signStoragePaths(client, [...storagePaths])

  for (const [entryId, photoId] of photoIdByEntryId) {
    const photoVariants = variantsByPhotoId.get(photoId) ?? []
    const thumbPreferred = pickPhotoVariantForContext(photoVariants, 'tiny')
    const coverPreferred = pickPhotoVariantForContext(photoVariants, 'card')
    if (thumbPreferred === null || coverPreferred === null) {
      continue
    }

    const thumbSrc = signedUrlByStoragePath.get(thumbPreferred.storage_path)
    const coverSrc = signedUrlByStoragePath.get(coverPreferred.storage_path)
    if (thumbSrc === undefined || coverSrc === undefined) {
      continue
    }

    const srcSet = buildJourneyCoverSrcSet(photoVariants, signedUrlByStoragePath)
    result.set(entryId, {
      cover: {
        src: coverSrc,
        ...(srcSet !== undefined ? { srcSet } : {}),
      },
      thumbSrc,
    })
  }

  return result
}

function buildJourneyCoverSrcSet(
  variants: readonly { storage_path: string; variant: string }[],
  signedUrlByStoragePath: Map<string, string>,
): string | undefined {
  const parts: string[] = []
  for (const { variant, width } of PHOTO_SRCSET_WIDTHS) {
    if (!JOURNEY_COVER_SRCSET_VARIANTS.has(variant)) {
      continue
    }
    const match = variants.find((row) => row.variant === variant)
    if (match === undefined) {
      continue
    }
    const url = signedUrlByStoragePath.get(match.storage_path)
    if (url === undefined) {
      continue
    }
    parts.push(`${url} ${width}w`)
  }
  return parts.length > 0 ? parts.join(', ') : undefined
}

async function signStoragePaths(
  client: TypedSupabaseClient,
  storagePaths: string[],
): Promise<Map<string, string>> {
  const signedUrlByStoragePath = new Map<string, string>()
  await Promise.all(
    storagePaths.map(async (storagePath) => {
      const { data, error } = await client.storage
        .from('photos')
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
      if (error === null) {
        signedUrlByStoragePath.set(storagePath, data.signedUrl)
      }
    }),
  )
  return signedUrlByStoragePath
}

/** @internal Exported for unit tests. */
export function pickVariantPreferenceForCardContext(
  variants: readonly { storage_path: string; variant: string }[],
): string | null {
  return pickPhotoVariantForContext(variants, 'card')?.storage_path ?? null
}

/** @internal Exported for unit tests. */
export function pickVariantPreferenceForTinyContext(
  variants: readonly { storage_path: string; variant: string }[],
): string | null {
  return pickPhotoVariantForContext(variants, 'tiny')?.storage_path ?? null
}

/** @internal Exported for unit tests. */
export function buildCoverSrcSetFromVariants(
  variants: readonly { storage_path: string; variant: string }[],
  urlByPath: ReadonlyMap<string, string>,
): string | undefined {
  return buildJourneyCoverSrcSet(variants, new Map(urlByPath))
}
