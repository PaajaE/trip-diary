import {
  PHOTO_VARIANT_PREFERENCE,
  pickPreferredPhotoVariant,
  type PhotoDisplayContext,
  type PhotoVariantKind as SharedPhotoVariantKind,
} from '@trip-diary/utils'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { getMeaningfulGpsCoordinates } from '@/entities/photo/lib/photo-exif-gps'
import { normalizeCoverFocalPoint } from '@/entities/photo/lib/cover-focal-point'
import type { LocalPhotoVariant, MediaType } from '@/entities/photo/model/photo'

export interface PhotoPreview {
  blob: Blob
  durationMs?: number
  focalX?: number
  focalY?: number
  height?: number
  id: string
  isCover?: boolean
  mediaType?: MediaType
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

function pickLocalCardVariant(
  variants: LocalPhotoVariant[],
): LocalPhotoVariant | undefined {
  return (
    pickLocalVariantForContext(variants, CARD_CONTEXT) ??
    pickLocalVariantForContext(variants, GRID_CONTEXT)
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

function focalFieldsFromLink(link: {
  focal_x?: number | null
  focal_y?: number | null
  is_cover?: boolean | null
}): Pick<PhotoPreview, 'focalX' | 'focalY'> {
  if (link.is_cover !== true) {
    return {}
  }
  const focal = normalizeCoverFocalPoint(link.focal_x, link.focal_y)
  if (focal === null) {
    return {}
  }
  return { focalX: focal.x, focalY: focal.y }
}

function previewFromVariant(
  photoId: string,
  variant: LocalPhotoVariant,
  extras?: {
    durationMs?: number
    isCover?: boolean
    mediaType?: MediaType
    position?: number
  },
): PositionedPhotoPreview {
  return {
    blob: variant.blob,
    height: variant.height,
    id: photoId,
    width: variant.width,
    ...(extras?.durationMs === undefined
      ? {}
      : { durationMs: extras.durationMs }),
    ...(extras?.isCover === undefined ? {} : { isCover: extras.isCover }),
    ...(extras?.mediaType === undefined ? {} : { mediaType: extras.mediaType }),
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
      const durationMs = preview.durationMs ?? remote.durationMs
      const mediaType = preview.mediaType ?? remote.mediaType
      previewsById.set(preview.id, {
        blob: preview.blob,
        id: preview.id,
        position: remote.position,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(height === undefined ? {} : { height }),
        ...(width === undefined ? {} : { width }),
        ...(mediaType === undefined ? {} : { mediaType }),
        ...(remote.isCover === undefined ? {} : { isCover: remote.isCover }),
        ...(remote.focalX === undefined ? {} : { focalX: remote.focalX }),
        ...(remote.focalY === undefined ? {} : { focalY: remote.focalY }),
      })
    }
  }

  return [...previewsById.values()]
    .sort(comparePositionedPhotoPreviews)
    .map(
      ({
        blob,
        durationMs,
        focalX,
        focalY,
        height,
        id,
        isCover,
        mediaType,
        width,
      }) => ({
        blob,
        id,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(focalX === undefined ? {} : { focalX }),
        ...(focalY === undefined ? {} : { focalY }),
        ...(height === undefined ? {} : { height }),
        ...(isCover === undefined ? {} : { isCover }),
        ...(mediaType === undefined ? {} : { mediaType }),
        ...(width === undefined ? {} : { width }),
      }),
    )
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
            ...(typeof photo.durationMs === 'number'
              ? { durationMs: photo.durationMs }
              : {}),
            isCover: photo.position === 0,
            mediaType: photo.mediaType,
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
  limitPerEntry?: number,
): Promise<Map<string, PositionedPhotoPreview[]>> {
  if (entryIds.length === 0) {
    return new Map()
  }

  const photos = await localDb.photos.where('entryId').anyOf(entryIds).toArray()
  if (photos.length === 0) {
    return new Map()
  }

  const photosByEntryId = new Map<string, typeof photos>()
  for (const photo of photos) {
    const list = photosByEntryId.get(photo.entryId) ?? []
    list.push(photo)
    photosByEntryId.set(photo.entryId, list)
  }

  const limitedPhotos = [...photosByEntryId.values()].flatMap((entryPhotos) => {
    const sorted = [...entryPhotos].sort(
      (left, right) => left.position - right.position,
    )
    return limitPerEntry === undefined ? sorted : sorted.slice(0, limitPerEntry)
  })

  const variants = await localDb.photoVariants
    .where('photoId')
    .anyOf(limitedPhotos.map((photo) => photo.id))
    .toArray()
  const variantsByPhotoId = new Map<string, LocalPhotoVariant[]>()
  for (const variant of variants) {
    const list = variantsByPhotoId.get(variant.photoId) ?? []
    list.push(variant)
    variantsByPhotoId.set(variant.photoId, list)
  }

  const result = new Map<string, PositionedPhotoPreview[]>()
  for (const photo of limitedPhotos) {
    const variant = pickVariant(variantsByPhotoId.get(photo.id) ?? [])
    if (variant === undefined) {
      continue
    }
    const previews = result.get(photo.entryId) ?? []
    previews.push(
      previewFromVariant(photo.id, variant, {
        ...(typeof photo.durationMs === 'number'
          ? { durationMs: photo.durationMs }
          : {}),
        isCover: photo.position === 0,
        mediaType: photo.mediaType,
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

async function getLocalPhotoCardPreviewsBatch(
  entryIds: string[],
  limitPerEntry?: number,
): Promise<Map<string, PositionedPhotoPreview[]>> {
  return getLocalPhotoPreviewsBatchForPicker(
    entryIds,
    pickLocalCardVariant,
    limitPerEntry,
  )
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

interface RemotePhotoMediaMeta {
  durationMs?: number
  mediaType?: MediaType
}

async function getRemotePhotoMediaMeta(
  photoIds: string[],
): Promise<Map<string, RemotePhotoMediaMeta>> {
  if (photoIds.length === 0) {
    return new Map()
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('photos')
    .select('id, media_type, duration_ms')
    .in('id', photoIds)
  if (error !== null) {
    return new Map()
  }

  const result = new Map<string, RemotePhotoMediaMeta>()
  for (const row of data) {
    result.set(row.id, {
      ...(row.media_type === 'video' ? { mediaType: 'video' as const } : {}),
      ...(typeof row.duration_ms === 'number'
        ? { durationMs: row.duration_ms }
        : {}),
    })
  }
  return result
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
    durationMs?: number
    focalX?: number
    focalY?: number
    height?: number | null
    isCover?: boolean
    mediaType?: MediaType
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
    ...(extras.durationMs === undefined
      ? {}
      : { durationMs: extras.durationMs }),
    ...(extras.isCover === undefined ? {} : { isCover: extras.isCover }),
    ...(extras.focalX === undefined ? {} : { focalX: extras.focalX }),
    ...(extras.focalY === undefined ? {} : { focalY: extras.focalY }),
    ...(extras.mediaType === undefined ? {} : { mediaType: extras.mediaType }),
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
    .select('photo_id, position, is_cover, focal_x, focal_y')
    .eq('entry_id', entryId)
    .order('position')
  if (linksError !== null) {
    throw linksError
  }
  if (links.length === 0) {
    return []
  }

  const photoIds = links.map((link) => link.photo_id)
  const [variantResult, mediaMetaByPhotoId] = await Promise.all([
    client
      .from('photo_variants')
      .select('photo_id, storage_path, variant, width, height')
      .in('photo_id', photoIds)
      .in('variant', [...variantKinds]),
    getRemotePhotoMediaMeta(photoIds),
  ])
  const { data: variantRows, error: variantError } = variantResult
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
      const mediaMeta = mediaMetaByPhotoId.get(link.photo_id)
      return downloadRemotePreview(match.storage_path, link.photo_id, {
        height: match.height,
        isCover: link.is_cover,
        position: link.position,
        width: match.width,
        ...focalFieldsFromLink(link),
        ...(mediaMeta?.durationMs === undefined
          ? {}
          : { durationMs: mediaMeta.durationMs }),
        ...(mediaMeta?.mediaType === undefined
          ? {}
          : { mediaType: mediaMeta.mediaType }),
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
  limitPerEntry?: number,
): Promise<Map<string, PositionedPhotoPreview[]>> {
  if (entryIds.length === 0) {
    return new Map()
  }

  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('entry_id, photo_id, position, is_cover, focal_x, focal_y')
    .in('entry_id', entryIds)
    .order('position')
  if (linksError !== null) {
    throw linksError
  }
  if (links.length === 0) {
    return new Map()
  }

  const linksToDownload =
    limitPerEntry === undefined
      ? links
      : (() => {
          const seen = new Map<string, number>()
          return links.filter((link) => {
            const count = seen.get(link.entry_id) ?? 0
            if (count >= limitPerEntry) {
              return false
            }
            seen.set(link.entry_id, count + 1)
            return true
          })
        })()
  const photoIds = [...new Set(linksToDownload.map((link) => link.photo_id))]
  const [variantResult, mediaMetaByPhotoId] = await Promise.all([
    client
      .from('photo_variants')
      .select('photo_id, storage_path, variant, width, height')
      .in('photo_id', photoIds)
      .in('variant', [...variantKinds]),
    getRemotePhotoMediaMeta(photoIds),
  ])
  const { data: variantRows, error: variantError } = variantResult
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
    linksToDownload.map(async (link) => {
      const match = pickRemoteStoragePath(
        rowsByPhotoId.get(link.photo_id) ?? [],
        context,
      )
      if (match === null) {
        throw new Error('missing preview variant')
      }
      const mediaMeta = mediaMetaByPhotoId.get(link.photo_id)
      const preview = await downloadRemotePreview(
        match.storage_path,
        link.photo_id,
        {
          height: match.height,
          isCover: link.is_cover,
          position: link.position,
          width: match.width,
          ...focalFieldsFromLink(link),
          ...(mediaMeta?.durationMs === undefined
            ? {}
            : { durationMs: mediaMeta.durationMs }),
          ...(mediaMeta?.mediaType === undefined
            ? {}
            : { mediaType: mediaMeta.mediaType }),
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
    limitPerEntry?: number,
  ) => Promise<Map<string, PositionedPhotoPreview[]>>,
  context: PhotoDisplayContext,
  variantKinds: readonly SharedPhotoVariantKind[],
  limitPerEntry?: number,
): Promise<JourneyEntryPhotoPreviews> {
  const uniqueEntryIds = [...new Set(entryIds)]
  const [localResult, remoteResult] = await Promise.allSettled([
    loadLocalBatch(uniqueEntryIds, limitPerEntry),
    getRemotePhotoPreviewsBatch(
      uniqueEntryIds,
      context,
      variantKinds,
      limitPerEntry,
    ),
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

/** Card/inline journey surfaces: prefer small (~800) over thumb/medium. */
export async function getJourneyEntryPhotoCardPreviews(
  entryIds: string[],
): Promise<JourneyEntryPhotoPreviews> {
  return getJourneyEntryPhotoPreviewsForVariant(
    entryIds,
    getLocalPhotoCardPreviewsBatch,
    CARD_CONTEXT,
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

/** Authoring overview cards: card-quality previews, capped per moment. */
export const AUTHOR_MOMENT_CARD_PREVIEW_LIMIT = 3

export async function getEntryPhotoCounts(
  entryIds: string[],
): Promise<Map<string, number>> {
  const uniqueEntryIds = [...new Set(entryIds)]
  const counts = new Map<string, number>()
  if (uniqueEntryIds.length === 0) {
    return counts
  }

  const localPhotos = await localDb.photos
    .where('entryId')
    .anyOf(uniqueEntryIds)
    .toArray()
  for (const photo of localPhotos) {
    counts.set(photo.entryId, (counts.get(photo.entryId) ?? 0) + 1)
  }

  try {
    const client = getSupabaseClient()
    const { data, error } = await client
      .from('entry_photos')
      .select('entry_id')
      .in('entry_id', uniqueEntryIds)
    if (error === null) {
      const remoteCounts = new Map<string, number>()
      for (const row of data) {
        remoteCounts.set(
          row.entry_id,
          (remoteCounts.get(row.entry_id) ?? 0) + 1,
        )
      }
      for (const entryId of uniqueEntryIds) {
        const remote = remoteCounts.get(entryId) ?? 0
        const local = counts.get(entryId) ?? 0
        counts.set(entryId, Math.max(remote, local))
      }
    }
  } catch {
    // Offline — local counts only.
  }

  return counts
}

export async function getJourneyEntryPhotoAuthorCardPreviews(
  entryIds: string[],
): Promise<JourneyEntryPhotoPreviews> {
  return getJourneyEntryPhotoPreviewsForVariant(
    entryIds,
    getLocalPhotoCardPreviewsBatch,
    CARD_CONTEXT,
    GRID_REMOTE_VARIANT_KINDS,
    AUTHOR_MOMENT_CARD_PREVIEW_LIMIT,
  )
}
