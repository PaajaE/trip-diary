import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { getMeaningfulGpsCoordinates } from '@/entities/photo/lib/photo-exif-gps'
import type { LocalPhotoVariant } from '@/entities/photo/model/photo'

export interface PhotoPreview {
  blob: Blob
  id: string
}

interface PositionedPhotoPreview extends PhotoPreview {
  position: number
}

function pickLocalThumbVariant(
  variants: LocalPhotoVariant[],
): LocalPhotoVariant | undefined {
  return (
    variants.find(({ kind }) => kind === 'thumb') ??
    variants.find(({ kind }) => kind === 'preview') ??
    variants.find(({ kind }) => kind === 'large')
  )
}

function pickLocalDetailVariant(
  variants: LocalPhotoVariant[],
): LocalPhotoVariant | undefined {
  return (
    variants.find(({ kind }) => kind === 'preview') ??
    variants.find(({ kind }) => kind === 'large') ??
    variants.find(({ kind }) => kind === 'thumb')
  )
}

function mergePositionedPreviews(
  localResult: PromiseSettledResult<PositionedPhotoPreview[]>,
  remoteResult: PromiseSettledResult<PositionedPhotoPreview[]>,
): PhotoPreview[] {
  if (localResult.status === 'rejected' && remoteResult.status === 'rejected') {
    throw new AggregateError(
      [localResult.reason, remoteResult.reason],
      'Photo previews could not be loaded',
    )
  }
  if (
    localResult.status === 'rejected' &&
    remoteResult.status === 'fulfilled' &&
    remoteResult.value.length === 0
  ) {
    throw localResult.reason
  }
  if (
    remoteResult.status === 'rejected' &&
    localResult.status === 'fulfilled' &&
    localResult.value.length === 0
  ) {
    throw remoteResult.reason
  }

  const previewsById = new Map<string, PositionedPhotoPreview>()
  if (remoteResult.status === 'fulfilled') {
    for (const preview of remoteResult.value) {
      previewsById.set(preview.id, preview)
    }
  }
  if (localResult.status === 'fulfilled') {
    for (const preview of localResult.value) {
      previewsById.set(preview.id, preview)
    }
  }

  return [...previewsById.values()]
    .sort((left, right) => left.position - right.position)
    .map(({ blob, id }) => ({ blob, id }))
}

function mergeEntryPreviews(
  localPreviews: PositionedPhotoPreview[],
  remotePreviews: PositionedPhotoPreview[],
  localFailed: boolean,
  remoteFailed: boolean,
): { failed: boolean; previews: PhotoPreview[] } {
  try {
    return {
      failed: false,
      previews: mergePositionedPreviews(
        localFailed
          ? { status: 'rejected', reason: new Error('local failed') }
          : { status: 'fulfilled', value: localPreviews },
        remoteFailed
          ? { status: 'rejected', reason: new Error('remote failed') }
          : { status: 'fulfilled', value: remotePreviews },
      ),
    }
  } catch {
    return { failed: true, previews: [] }
  }
}

async function getLocalPhotoPreviewsForPicker(
  entryId: string,
  pickVariant: (variants: LocalPhotoVariant[]) => LocalPhotoVariant | undefined,
): Promise<PositionedPhotoPreview[]> {
  const photos = await localDb.photos
    .where('entryId')
    .equals(entryId)
    .sortBy('position')
  const previews = await Promise.allSettled(
    photos.map(async (photo) => {
      const variants = await localDb.photoVariants
        .where('photoId')
        .equals(photo.id)
        .toArray()
      const variant = pickVariant(variants)
      return variant === undefined
        ? null
        : { blob: variant.blob, id: photo.id, position: photo.position }
    }),
  )

  return previews.flatMap((preview) =>
    preview.status === 'fulfilled' && preview.value !== null
      ? [preview.value]
      : [],
  )
}

async function getLocalPhotoPreviews(
  entryId: string,
): Promise<PositionedPhotoPreview[]> {
  return getLocalPhotoPreviewsForPicker(entryId, pickLocalThumbVariant)
}

async function getLocalPhotoDetailPreviews(
  entryId: string,
): Promise<PositionedPhotoPreview[]> {
  return getLocalPhotoPreviewsForPicker(entryId, pickLocalDetailVariant)
}

async function getLocalPhotoPreviewsBatchForPicker(
  entryIds: string[],
  pickVariant: (variants: LocalPhotoVariant[]) => LocalPhotoVariant | undefined,
): Promise<Map<string, PositionedPhotoPreview[]>> {
  if (entryIds.length === 0) {
    return new Map()
  }

  const photos = await localDb.photos.where('entryId').anyOf(entryIds).toArray()
  if (photos.length === 0) {
    return new Map()
  }

  const variants = await localDb.photoVariants
    .where('photoId')
    .anyOf(photos.map((photo) => photo.id))
    .toArray()
  const variantsByPhotoId = new Map<string, LocalPhotoVariant[]>()
  for (const variant of variants) {
    const list = variantsByPhotoId.get(variant.photoId) ?? []
    list.push(variant)
    variantsByPhotoId.set(variant.photoId, list)
  }

  const result = new Map<string, PositionedPhotoPreview[]>()
  for (const photo of photos) {
    const variant = pickVariant(variantsByPhotoId.get(photo.id) ?? [])
    if (variant === undefined) {
      continue
    }
    const previews = result.get(photo.entryId) ?? []
    previews.push({
      blob: variant.blob,
      id: photo.id,
      position: photo.position,
    })
    result.set(photo.entryId, previews)
  }

  for (const previews of result.values()) {
    previews.sort((left, right) => left.position - right.position)
  }

  return result
}

async function getLocalPhotoPreviewsBatch(
  entryIds: string[],
): Promise<Map<string, PositionedPhotoPreview[]>> {
  return getLocalPhotoPreviewsBatchForPicker(entryIds, pickLocalThumbVariant)
}

async function getLocalPhotoDetailPreviewsBatch(
  entryIds: string[],
): Promise<Map<string, PositionedPhotoPreview[]>> {
  return getLocalPhotoPreviewsBatchForPicker(entryIds, pickLocalDetailVariant)
}

async function getRemotePhotoPreviewsForVariant(
  entryId: string,
  variantKind: 'thumb' | 'preview',
): Promise<PositionedPhotoPreview[]> {
  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('photo_id, position')
    .eq('entry_id', entryId)
    .order('position')
  if (linksError !== null) {
    throw linksError
  }

  const previews = await Promise.allSettled(
    links.map(async (link) => {
      const { data: variant, error: variantError } = await client
        .from('photo_variants')
        .select('storage_path')
        .eq('photo_id', link.photo_id)
        .eq('variant', variantKind)
        .maybeSingle()
      if (variantError !== null) {
        throw variantError
      }
      if (variant === null) {
        throw new Error('missing variant')
      }
      const { data: blob, error: downloadError } = await client.storage
        .from('photos')
        .download(variant.storage_path)
      if (downloadError !== null) {
        throw downloadError
      }
      return { blob, id: link.photo_id, position: link.position }
    }),
  )

  return previews.flatMap((preview) =>
    preview.status === 'fulfilled' ? [preview.value] : [],
  )
}

async function getRemotePhotoPreviews(
  entryId: string,
): Promise<PositionedPhotoPreview[]> {
  return getRemotePhotoPreviewsForVariant(entryId, 'preview')
}

async function getRemotePhotoThumbPreviews(
  entryId: string,
): Promise<PositionedPhotoPreview[]> {
  const thumbPreviews = await getRemotePhotoPreviewsForVariant(entryId, 'thumb')
  if (thumbPreviews.length > 0) {
    return thumbPreviews
  }
  return getRemotePhotoPreviewsForVariant(entryId, 'preview')
}

async function getRemotePhotoPreviewsBatch(
  entryIds: string[],
): Promise<Map<string, PositionedPhotoPreview[]>> {
  if (entryIds.length === 0) {
    return new Map()
  }

  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('entry_id, photo_id, position')
    .in('entry_id', entryIds)
    .order('position')
  if (linksError !== null) {
    throw linksError
  }
  if (links.length === 0) {
    return new Map()
  }

  const photoIds = [...new Set(links.map((link) => link.photo_id))]
  const { data: variantRows, error: variantError } = await client
    .from('photo_variants')
    .select('photo_id, storage_path')
    .in('photo_id', photoIds)
    .eq('variant', 'preview')
  if (variantError !== null) {
    throw variantError
  }

  const storagePathByPhotoId = new Map<string, string>()
  for (const row of variantRows) {
    storagePathByPhotoId.set(row.photo_id, row.storage_path)
  }

  const downloads = await Promise.allSettled(
    links.map(async (link) => {
      const storagePath = storagePathByPhotoId.get(link.photo_id)
      if (storagePath === undefined) {
        throw new Error('missing preview variant')
      }
      const { data: blob, error: downloadError } = await client.storage
        .from('photos')
        .download(storagePath)
      if (downloadError !== null) {
        throw downloadError
      }
      return {
        blob,
        entryId: link.entry_id,
        id: link.photo_id,
        position: link.position,
      }
    }),
  )

  const result = new Map<string, PositionedPhotoPreview[]>()
  for (const [index, download] of downloads.entries()) {
    if (download.status !== 'fulfilled') {
      continue
    }
    const link = links[index]
    if (link === undefined) {
      continue
    }
    const previews = result.get(link.entry_id) ?? []
    previews.push({
      blob: download.value.blob,
      id: link.photo_id,
      position: link.position,
    })
    result.set(link.entry_id, previews)
  }

  for (const previews of result.values()) {
    previews.sort((left, right) => left.position - right.position)
  }

  return result
}

export async function getEntryPhotoPreviews(
  entryId: string,
): Promise<PhotoPreview[]> {
  const [localResult, remoteResult] = await Promise.allSettled([
    getLocalPhotoPreviews(entryId),
    getRemotePhotoThumbPreviews(entryId),
  ])

  return mergePositionedPreviews(localResult, remoteResult)
}

export async function getEntryPhotoDetailPreviews(
  entryId: string,
): Promise<PhotoPreview[]> {
  const [localResult, remoteResult] = await Promise.allSettled([
    getLocalPhotoDetailPreviews(entryId),
    getRemotePhotoPreviews(entryId),
  ])

  return mergePositionedPreviews(localResult, remoteResult)
}

export async function getPhotoCoordinates(
  photoId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const photo = await localDb.photos.get(photoId)
  if (photo === undefined) {
    return null
  }

  return getMeaningfulGpsCoordinates(photo.latitude, photo.longitude)
}

export async function getPhotoDetailPreview(
  photoId: string,
): Promise<PhotoPreview | null> {
  const photo = await localDb.photos.get(photoId)
  if (photo === undefined) {
    return getRemotePhotoDetailPreview(photoId)
  }

  const variants = await localDb.photoVariants
    .where('photoId')
    .equals(photoId)
    .toArray()
  const variant = pickLocalDetailVariant(variants)
  if (variant !== undefined) {
    return { blob: variant.blob, id: photoId }
  }

  return getRemotePhotoDetailPreview(photoId)
}

async function getRemotePhotoDetailPreview(
  photoId: string,
): Promise<PhotoPreview | null> {
  const client = getSupabaseClient()
  for (const variantKind of ['preview', 'thumb'] as const) {
    const { data: variant, error: variantError } = await client
      .from('photo_variants')
      .select('storage_path')
      .eq('photo_id', photoId)
      .eq('variant', variantKind)
      .maybeSingle()
    if (variantError !== null || variant === null) {
      continue
    }
    const { data: blob, error: downloadError } = await client.storage
      .from('photos')
      .download(variant.storage_path)
    if (downloadError !== null) {
      continue
    }
    return { blob, id: photoId }
  }
  return null
}

export interface JourneyEntryPhotoPreviews {
  failedEntryIds: Set<string>
  previewsByEntry: Map<string, PhotoPreview[]>
}

async function getJourneyEntryPhotoPreviewsForVariant(
  entryIds: string[],
  loadLocalBatch: (
    entryIds: string[],
  ) => Promise<Map<string, PositionedPhotoPreview[]>>,
): Promise<JourneyEntryPhotoPreviews> {
  const uniqueEntryIds = [...new Set(entryIds)]
  const [localResult, remoteResult] = await Promise.allSettled([
    loadLocalBatch(uniqueEntryIds),
    getRemotePhotoPreviewsBatch(uniqueEntryIds),
  ])

  const localFailed = localResult.status === 'rejected'
  const remoteFailed = remoteResult.status === 'rejected'
  const localByEntry =
    localResult.status === 'fulfilled'
      ? localResult.value
      : new Map<string, PositionedPhotoPreview[]>()
  const remoteByEntry =
    remoteResult.status === 'fulfilled'
      ? remoteResult.value
      : new Map<string, PositionedPhotoPreview[]>()

  const previewsByEntry = new Map<string, PhotoPreview[]>()
  const failedEntryIds = new Set<string>()
  for (const entryId of uniqueEntryIds) {
    const merged = mergeEntryPreviews(
      localByEntry.get(entryId) ?? [],
      remoteByEntry.get(entryId) ?? [],
      localFailed,
      remoteFailed,
    )
    previewsByEntry.set(entryId, merged.previews)
    if (merged.failed) {
      failedEntryIds.add(entryId)
    }
  }

  if (
    uniqueEntryIds.length > 0 &&
    failedEntryIds.size === uniqueEntryIds.length
  ) {
    throw new AggregateError(
      [
        localFailed ? localResult.reason : null,
        remoteFailed ? remoteResult.reason : null,
      ].filter(Boolean),
      'Photo previews could not be loaded',
    )
  }

  return { failedEntryIds, previewsByEntry }
}

export async function getJourneyEntryPhotoPreviews(
  entryIds: string[],
): Promise<JourneyEntryPhotoPreviews> {
  return getJourneyEntryPhotoPreviewsForVariant(
    entryIds,
    getLocalPhotoPreviewsBatch,
  )
}

export async function getJourneyEntryPhotoDetailPreviews(
  entryIds: string[],
): Promise<JourneyEntryPhotoPreviews> {
  return getJourneyEntryPhotoPreviewsForVariant(
    entryIds,
    getLocalPhotoDetailPreviewsBatch,
  )
}
