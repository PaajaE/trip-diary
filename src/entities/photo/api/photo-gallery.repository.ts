import {
  PHOTO_VARIANT_PREFERENCE,
  pickPreferredPhotoVariant,
  type PhotoDisplayContext,
  type PhotoVariantKind as SharedPhotoVariantKind,
} from '@trip-diary/utils'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { getMeaningfulGpsCoordinates } from '@/entities/photo/lib/photo-exif-gps'
import type { LocalPhotoVariant } from '@/entities/photo/model/photo'

export interface PhotoPreview {
  blob: Blob
  height?: number
  id: string
  isCover?: boolean
  width?: number
}

interface PositionedPhotoPreview extends PhotoPreview {
  isCover?: boolean
  position: number
}

const GRID_CONTEXT: PhotoDisplayContext = 'tiny'
const CARD_CONTEXT: PhotoDisplayContext = 'card'
const DETAIL_CONTEXT: PhotoDisplayContext = 'fullscreen'
const ZOOM_CONTEXT: PhotoDisplayContext = 'zoom'

/** Variants to fetch for grid/thumb contexts (tiny ∪ card preference chains). */
const GRID_REMOTE_VARIANT_KINDS = uniqueKinds([
  ...PHOTO_VARIANT_PREFERENCE.tiny,
  ...PHOTO_VARIANT_PREFERENCE.card,
])

/** Variants to fetch for detail/lightbox (fullscreen ∪ zoom; preview ≡ full). */
const DETAIL_REMOTE_VARIANT_KINDS = uniqueKinds([
  ...PHOTO_VARIANT_PREFERENCE.fullscreen,
  ...PHOTO_VARIANT_PREFERENCE.zoom,
])

function uniqueKinds(
  kinds: readonly SharedPhotoVariantKind[],
): SharedPhotoVariantKind[] {
  return [...new Set(kinds)]
}

function comparePositionedPhotoPreviews(
  left: PositionedPhotoPreview,
  right: PositionedPhotoPreview,
): number {
  const coverDelta =
    Number(right.isCover === true) - Number(left.isCover === true)
  if (coverDelta !== 0) {
    return coverDelta
  }
  return left.position - right.position
}

function toVariantRows(
  variants: LocalPhotoVariant[],
): (LocalPhotoVariant & { variant: string })[] {
  return variants.map((variant) => ({ ...variant, variant: variant.kind }))
}

function pickLocalVariantForContext(
  variants: LocalPhotoVariant[],
  context: PhotoDisplayContext,
): LocalPhotoVariant | undefined {
  return (
    pickPreferredPhotoVariant(
      toVariantRows(variants),
      PHOTO_VARIANT_PREFERENCE[context],
    ) ?? undefined
  )
}

function pickLocalThumbVariant(
  variants: LocalPhotoVariant[],
): LocalPhotoVariant | undefined {
  return (
    pickLocalVariantForContext(variants, GRID_CONTEXT) ??
    pickLocalVariantForContext(variants, CARD_CONTEXT)
  )
}

function pickLocalDetailVariant(
  variants: LocalPhotoVariant[],
): LocalPhotoVariant | undefined {
  return (
    pickLocalVariantForContext(variants, DETAIL_CONTEXT) ??
    pickLocalVariantForContext(variants, ZOOM_CONTEXT)
  )
}

function pickLocalZoomVariant(
  variants: LocalPhotoVariant[],
): LocalPhotoVariant | undefined {
  return pickLocalVariantForContext(variants, ZOOM_CONTEXT)
}

function previewFromVariant(
  photoId: string,
  variant: LocalPhotoVariant,
  extras?: { isCover?: boolean; position?: number },
): PositionedPhotoPreview {
  return {
    blob: variant.blob,
    height: variant.height,
    id: photoId,
    width: variant.width,
    ...(extras?.isCover === undefined ? {} : { isCover: extras.isCover }),
    position: extras?.position ?? 0,
  }
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
      const remote = previewsById.get(preview.id)
      if (remote === undefined) {
        previewsById.set(preview.id, preview)
        continue
      }
      // Prefer local blob (fresher offline), but keep remote cover/position.
      const height = preview.height ?? remote.height
      const width = preview.width ?? remote.width
      previewsById.set(preview.id, {
        blob: preview.blob,
        id: preview.id,
        position: remote.position,
        ...(height === undefined ? {} : { height }),
        ...(width === undefined ? {} : { width }),
        ...(remote.isCover === undefined ? {} : { isCover: remote.isCover }),
      })
    }
  }

  return [...previewsById.values()]
    .sort(comparePositionedPhotoPreviews)
    .map(({ blob, height, id, isCover, width }) => ({
      blob,
      id,
      ...(height === undefined ? {} : { height }),
      ...(isCover === undefined ? {} : { isCover }),
      ...(width === undefined ? {} : { width }),
    }))
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
        : previewFromVariant(photo.id, variant, {
            isCover: photo.position === 0,
            position: photo.position,
          })
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
    previews.push(
      previewFromVariant(photo.id, variant, {
        isCover: photo.position === 0,
        position: photo.position,
      }),
    )
    result.set(photo.entryId, previews)
  }

  for (const previews of result.values()) {
    previews.sort(comparePositionedPhotoPreviews)
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

interface RemoteVariantRow {
  height: number | null
  photo_id: string
  storage_path: string
  variant: string
  width: number | null
}

function pickRemoteStoragePath(
  rows: RemoteVariantRow[],
  context: PhotoDisplayContext,
): RemoteVariantRow | null {
  return pickPreferredPhotoVariant(rows, PHOTO_VARIANT_PREFERENCE[context])
}

async function downloadRemotePreview(
  storagePath: string,
  photoId: string,
  extras: {
    height?: number | null
    isCover?: boolean
    position: number
    width?: number | null
  },
): Promise<PositionedPhotoPreview> {
  const client = getSupabaseClient()
  const { data: blob, error: downloadError } = await client.storage
    .from('photos')
    .download(storagePath)
  if (downloadError !== null) {
    throw downloadError
  }
  return {
    blob,
    id: photoId,
    position: extras.position,
    ...(extras.isCover === undefined ? {} : { isCover: extras.isCover }),
    ...(typeof extras.height === 'number' ? { height: extras.height } : {}),
    ...(typeof extras.width === 'number' ? { width: extras.width } : {}),
  }
}

async function getRemotePhotoPreviewsForContext(
  entryId: string,
  context: PhotoDisplayContext,
  variantKinds: readonly SharedPhotoVariantKind[],
): Promise<PositionedPhotoPreview[]> {
  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('photo_id, position, is_cover')
    .eq('entry_id', entryId)
    .order('position')
  if (linksError !== null) {
    throw linksError
  }
  if (links.length === 0) {
    return []
  }

  const photoIds = links.map((link) => link.photo_id)
  const { data: variantRows, error: variantError } = await client
    .from('photo_variants')
    .select('photo_id, storage_path, variant, width, height')
    .in('photo_id', photoIds)
    .in('variant', [...variantKinds])
  if (variantError !== null) {
    throw variantError
  }

  const rowsByPhotoId = new Map<string, RemoteVariantRow[]>()
  for (const row of variantRows) {
    const list = rowsByPhotoId.get(row.photo_id) ?? []
    list.push(row)
    rowsByPhotoId.set(row.photo_id, list)
  }

  const previews = await Promise.allSettled(
    links.map(async (link) => {
      const match = pickRemoteStoragePath(
        rowsByPhotoId.get(link.photo_id) ?? [],
        context,
      )
      if (match === null) {
        throw new Error('missing variant')
      }
      return downloadRemotePreview(match.storage_path, link.photo_id, {
        height: match.height,
        isCover: link.is_cover,
        position: link.position,
        width: match.width,
      })
    }),
  )

  return previews.flatMap((preview) =>
    preview.status === 'fulfilled' ? [preview.value] : [],
  )
}

async function getRemotePhotoPreviews(
  entryId: string,
): Promise<PositionedPhotoPreview[]> {
  return getRemotePhotoPreviewsForContext(
    entryId,
    DETAIL_CONTEXT,
    DETAIL_REMOTE_VARIANT_KINDS,
  )
}

async function getRemotePhotoThumbPreviews(
  entryId: string,
): Promise<PositionedPhotoPreview[]> {
  return getRemotePhotoPreviewsForContext(
    entryId,
    GRID_CONTEXT,
    GRID_REMOTE_VARIANT_KINDS,
  )
}

async function getRemotePhotoPreviewsBatch(
  entryIds: string[],
  context: PhotoDisplayContext,
  variantKinds: readonly SharedPhotoVariantKind[],
): Promise<Map<string, PositionedPhotoPreview[]>> {
  if (entryIds.length === 0) {
    return new Map()
  }

  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('entry_id, photo_id, position, is_cover')
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
    .select('photo_id, storage_path, variant, width, height')
    .in('photo_id', photoIds)
    .in('variant', [...variantKinds])
  if (variantError !== null) {
    throw variantError
  }

  const rowsByPhotoId = new Map<string, RemoteVariantRow[]>()
  for (const row of variantRows) {
    const list = rowsByPhotoId.get(row.photo_id) ?? []
    list.push(row)
    rowsByPhotoId.set(row.photo_id, list)
  }

  const downloads = await Promise.allSettled(
    links.map(async (link) => {
      const match = pickRemoteStoragePath(
        rowsByPhotoId.get(link.photo_id) ?? [],
        context,
      )
      if (match === null) {
        throw new Error('missing preview variant')
      }
      const preview = await downloadRemotePreview(
        match.storage_path,
        link.photo_id,
        {
          height: match.height,
          isCover: link.is_cover,
          position: link.position,
          width: match.width,
        },
      )
      return { ...preview, entryId: link.entry_id }
    }),
  )

  const result = new Map<string, PositionedPhotoPreview[]>()
  for (const download of downloads) {
    if (download.status !== 'fulfilled') {
      continue
    }
    const { entryId, ...preview } = download.value
    const previews = result.get(entryId) ?? []
    previews.push(preview)
    result.set(entryId, previews)
  }

  for (const previews of result.values()) {
    previews.sort(comparePositionedPhotoPreviews)
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
    return getRemotePhotoDetailPreview(photoId, DETAIL_CONTEXT)
  }

  const variants = await localDb.photoVariants
    .where('photoId')
    .equals(photoId)
    .toArray()
  const variant = pickLocalDetailVariant(variants)
  if (variant !== undefined) {
    return {
      blob: variant.blob,
      height: variant.height,
      id: photoId,
      width: variant.width,
    }
  }

  return getRemotePhotoDetailPreview(photoId, DETAIL_CONTEXT)
}

/** Zoom/master upgrade after lightbox medium load (full, with preview fallback). */
export async function getPhotoZoomPreview(
  photoId: string,
): Promise<PhotoPreview | null> {
  const photo = await localDb.photos.get(photoId)
  if (photo !== undefined) {
    const variants = await localDb.photoVariants
      .where('photoId')
      .equals(photoId)
      .toArray()
    const variant = pickLocalZoomVariant(variants)
    if (variant !== undefined) {
      return {
        blob: variant.blob,
        height: variant.height,
        id: photoId,
        width: variant.width,
      }
    }
  }

  return getRemotePhotoDetailPreview(photoId, ZOOM_CONTEXT)
}

async function getRemotePhotoDetailPreview(
  photoId: string,
  context: PhotoDisplayContext,
): Promise<PhotoPreview | null> {
  const client = getSupabaseClient()
  const { data: variantRows, error: variantError } = await client
    .from('photo_variants')
    .select('photo_id, storage_path, variant, width, height')
    .eq('photo_id', photoId)
    .in('variant', [...DETAIL_REMOTE_VARIANT_KINDS])
  if (variantError !== null || variantRows.length === 0) {
    return null
  }

  const match = pickRemoteStoragePath(variantRows, context)
  if (match === null) {
    return null
  }

  const { data: blob, error: downloadError } = await client.storage
    .from('photos')
    .download(match.storage_path)
  if (downloadError !== null) {
    return null
  }
  return {
    blob,
    id: photoId,
    ...(typeof match.height === 'number' ? { height: match.height } : {}),
    ...(typeof match.width === 'number' ? { width: match.width } : {}),
  }
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
  context: PhotoDisplayContext,
  variantKinds: readonly SharedPhotoVariantKind[],
): Promise<JourneyEntryPhotoPreviews> {
  const uniqueEntryIds = [...new Set(entryIds)]
  const [localResult, remoteResult] = await Promise.allSettled([
    loadLocalBatch(uniqueEntryIds),
    getRemotePhotoPreviewsBatch(uniqueEntryIds, context, variantKinds),
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
    GRID_CONTEXT,
    GRID_REMOTE_VARIANT_KINDS,
  )
}

export async function getJourneyEntryPhotoDetailPreviews(
  entryIds: string[],
): Promise<JourneyEntryPhotoPreviews> {
  return getJourneyEntryPhotoPreviewsForVariant(
    entryIds,
    getLocalPhotoDetailPreviewsBatch,
    DETAIL_CONTEXT,
    DETAIL_REMOTE_VARIANT_KINDS,
  )
}
