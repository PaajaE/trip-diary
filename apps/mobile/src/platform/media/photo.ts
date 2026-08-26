import * as FileSystem from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import {
  getMeaningfulGpsCoordinates,
  looksLikeJpegBytes,
  parseNativeExifGps,
} from '@trip-diary/utils'
import { createUuid } from '@/platform/id'
import {
  MASTER_JPEG_QUALITY,
  PHOTO_VARIANT_POLICY,
  resolveMediumDimensions,
  resolveNormalizedDimensions,
  resolveSmallDimensions,
  resolveThumbDimensions,
} from '@/platform/media/normalize-dimensions'
import { PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES } from '@/platform/sync/photo-storage-limits'

export interface PhotoMetadata {
  capturedAt: string | null
  latitude: number | null
  localUri: string
  longitude: number | null
}

export type PhotoMimeType = 'image/jpeg' | 'image/webp'

export type MediaPrepareStage =
  | 'copy'
  | 'normalize'
  | 'small'
  | 'thumb'
  | 'validate'
  | 'permission'

export interface PickedPhotoDiagnostics {
  attemptCount: number
  declaredMime: string | null
  failedStage: MediaPrepareStage | null
  lastError: string | null
  normalizedByteSize: number | null
  normalizedHeight: number | null
  normalizedWidth: number | null
  originalByteSize: number | null
  sourceHeight: number | null
  sourceUriScheme: string
  sourceWidth: number | null
}

export type PickedPhotoStatus = 'ready' | 'failed'

export interface PickedPhoto {
  diagnostics: PickedPhotoDiagnostics
  height: number
  localId: string
  metadata: PhotoMetadata
  mimeType: PhotoMimeType
  /**
   * Master JPEG in app-owned storage when ready; empty when failed without a
   * recoverable local file. This is the canonical `full` variant.
   */
  uri: string
  /**
   * Optional ~220px thumb JPEG (`PHOTO_VARIANT_POLICY.thumb`).
   * Missing thumb must not invalidate the master.
   */
  thumbUri: string | null
  /**
   * Optional ~800px small JPEG (`PHOTO_VARIANT_POLICY.small`) for cards / editor grids.
   * Missing small must not invalidate the master.
   */
  smallUri: string | null
  width: number
  status: PickedPhotoStatus
}

export type PickPhotosStatus = 'selected' | 'canceled' | 'empty'

export interface PickPhotosResult {
  /** Accepted + failed items — length matches picker selection when possible. */
  photos: PickedPhoto[]
  status: PickPhotosStatus
}

const imageLibraryOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  allowsMultipleSelection: true,
  exif: true,
  mediaTypes: ['images'],
  orderedSelection: true,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
  quality: 1,
  selectionLimit: 0,
}

export interface PickPhotosOptions {
  /**
   * Called immediately after each asset is prepared (ready or failed).
   * Use to persist durable draft state before the next asset / before crash.
   */
  onItemPrepared?: (photo: PickedPhoto) => Promise<void>
}

async function pickImageFromSource(
  source: 'library' | 'camera',
  options: PickPhotosOptions = {},
): Promise<PickedPhoto | null> {
  const result = await pickPhotosFromSource(source, options)
  return result.photos.find((photo) => photo.status === 'ready') ?? null
}

async function pickPhotosFromSource(
  source: 'library' | 'camera',
  options: PickPhotosOptions = {},
): Promise<PickPhotosResult> {
  const permission =
    source === 'library'
      ? await ensureMediaLibraryPermission()
      : await ensureCameraPermission()

  if (!permission.granted) {
    throw new Error(
      source === 'library'
        ? 'Photo library permission is required'
        : 'Camera permission is required',
    )
  }

  const result =
    source === 'library'
      ? await ImagePicker.launchImageLibraryAsync(imageLibraryOptions)
      : await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          exif: true,
          mediaTypes: ['images'],
          quality: 0.9,
        })

  logPhotoPickDev(source, permission, result)

  if (result.canceled) {
    return { photos: [], status: 'canceled' }
  }

  if (result.assets.length === 0) {
    return { photos: [], status: 'empty' }
  }

  const photos: PickedPhoto[] = []

  for (const asset of result.assets) {
    // Every selected asset becomes a durable row in the returned list —
    // never silently omit a failure.
    const prepared = await materializePickedAssetSafe(asset)
    if (options.onItemPrepared !== undefined) {
      await options.onItemPrepared(prepared)
    }
    photos.push(prepared)
  }

  const anyReady = photos.some((photo) => photo.status === 'ready')
  return {
    photos,
    status: anyReady || photos.length > 0 ? 'selected' : 'empty',
  }
}

export async function pickPhoto(): Promise<PickedPhoto | null> {
  const result = await pickPhotos()
  return result.photos.find((photo) => photo.status === 'ready') ?? null
}

export async function pickPhotos(
  options: PickPhotosOptions = {},
): Promise<PickPhotosResult> {
  await ensureMediaLibraryPermission()
  return pickPhotosFromSource('library', options)
}

export async function capturePhoto(): Promise<PickedPhoto | null> {
  return pickImageFromSource('camera')
}

export async function materializePickedAssetSafe(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickedPhoto> {
  const localId = createUuid()
  const sourceUri = typeof asset.uri === 'string' ? asset.uri.trim() : ''
  const baseDiagnostics: PickedPhotoDiagnostics = {
    attemptCount: 1,
    declaredMime:
      typeof asset.mimeType === 'string' && asset.mimeType.length > 0
        ? asset.mimeType
        : null,
    failedStage: null,
    lastError: null,
    normalizedByteSize: null,
    normalizedHeight: null,
    normalizedWidth: null,
    originalByteSize: null,
    sourceHeight: readPositiveDimension(asset.height),
    sourceUriScheme: readUriScheme(sourceUri),
    sourceWidth: readPositiveDimension(asset.width),
  }

  if (sourceUri.length === 0) {
    return createFailedPickedPhoto(
      localId,
      baseDiagnostics,
      'Selected photo has an empty URI.',
      'copy',
    )
  }

  try {
    return await materializePickedAsset(asset, localId, baseDiagnostics)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Photo could not be prepared.'
    const stage = inferFailedStage(message)
    console.warn('[photo-picker] materialize failed', {
      localId,
      message,
      scheme: baseDiagnostics.sourceUriScheme,
      stage,
    })
    return createFailedPickedPhoto(localId, baseDiagnostics, message, stage)
  }
}

/**
 * Persist a picker asset into app-owned storage as a normalized JPEG master
 * (and best-effort small + thumb). Always runs dimension policy — never bypasses
 * normalization for "already JPEG" sources.
 */
export async function materializePickedAsset(
  asset: ImagePicker.ImagePickerAsset,
  localId: string = createUuid(),
  diagnostics: PickedPhotoDiagnostics = {
    attemptCount: 1,
    declaredMime: asset.mimeType ?? null,
    failedStage: null,
    lastError: null,
    normalizedByteSize: null,
    normalizedHeight: null,
    normalizedWidth: null,
    originalByteSize: null,
    sourceHeight: readPositiveDimension(asset.height),
    sourceUriScheme: readUriScheme(asset.uri),
    sourceWidth: readPositiveDimension(asset.width),
  },
): Promise<PickedPhoto> {
  if (typeof asset.uri !== 'string' || asset.uri.trim().length === 0) {
    throw new Error('Selected photo has an empty URI.')
  }

  const metadataFromExif = await extractPhotoMetadata(
    asset.uri,
    asset.exif ?? null,
  )

  const stagingFilename = `staging-${localId}`
  let stagingUri: string
  try {
    stagingUri = await copyPickerUriToDocuments(asset.uri, stagingFilename)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not copy selected photo.'
    throw Object.assign(new Error(message), { stage: 'copy' as const })
  }

  try {
    const originalByteSize = await getLocalFileByteSize(stagingUri)
    diagnostics.originalByteSize = originalByteSize

    const sourceWidth = readPositiveDimension(asset.width)
    const sourceHeight = readPositiveDimension(asset.height)
    // If picker omitted dims, probe after we have a local file via manipulate.
    const plan = resolveNormalizedDimensions({
      height: sourceHeight,
      width: sourceWidth,
    })

    const master = await normalizeToPersistentJpeg({
      localId,
      sourceHeight,
      sourceUri: stagingUri,
      sourceWidth,
      targetHeight: plan.height,
      targetWidth: plan.width,
    })

    const masterByteSize = await getLocalFileByteSize(master.uri)
    if (masterByteSize <= 0) {
      throw Object.assign(new Error('Normalized photo file is empty.'), {
        stage: 'validate' as const,
      })
    }

    if (masterByteSize > PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES) {
      throw Object.assign(
        new Error(
          `Normalized photo exceeds Storage limit (${String(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES)} bytes): ${String(masterByteSize)} bytes.`,
        ),
        { stage: 'validate' as const },
      )
    }

    let smallUri: string | null = null
    try {
      const small = await generateSmallJpeg(
        master.uri,
        localId,
        master.width,
        master.height,
      )
      smallUri = small.uri
    } catch (smallError) {
      const message =
        smallError instanceof Error
          ? smallError.message
          : 'Small variant generation failed.'
      console.warn('[photo-picker] small failed', { localId, message })
    }

    let thumbUri: string | null = null
    try {
      const thumb = await generateThumbJpeg(
        master.uri,
        localId,
        master.width,
        master.height,
      )
      thumbUri = thumb.uri
    } catch (thumbError) {
      // Thumb is best-effort at import time; upload can retry from master.
      const message =
        thumbError instanceof Error
          ? thumbError.message
          : 'Thumbnail generation failed.'
      console.warn('[photo-picker] thumb failed', { localId, message })
    }

    return {
      diagnostics: {
        ...diagnostics,
        failedStage: null,
        lastError: null,
        normalizedByteSize: masterByteSize,
        normalizedHeight: master.height,
        normalizedWidth: master.width,
        originalByteSize,
        sourceHeight,
        sourceWidth,
      },
      height: master.height,
      localId,
      metadata: {
        ...metadataFromExif,
        localUri: master.uri,
      },
      mimeType: 'image/jpeg',
      smallUri,
      status: 'ready',
      thumbUri,
      uri: master.uri,
      width: master.width,
    }
  } finally {
    if (!stagingUri.endsWith(`/${localId}.jpg`)) {
      await safeDeleteAsync(stagingUri)
    }
  }
}

function createFailedPickedPhoto(
  localId: string,
  diagnostics: PickedPhotoDiagnostics,
  message: string,
  stage: MediaPrepareStage,
): PickedPhoto {
  return {
    diagnostics: {
      ...diagnostics,
      failedStage: stage,
      lastError: message,
    },
    height: diagnostics.sourceHeight ?? 1,
    localId,
    metadata: {
      capturedAt: null,
      latitude: null,
      localUri: '',
      longitude: null,
    },
    mimeType: 'image/jpeg',
    status: 'failed',
    smallUri: null,
    thumbUri: null,
    uri: '',
    width: diagnostics.sourceWidth ?? 1,
  }
}

export async function extractPhotoMetadata(
  _uri: string,
  exif: Record<string, unknown> | null,
): Promise<PhotoMetadata> {
  const capturedAt = readExifTimestamp(exif)
  const parsed = parseNativeExifGps(exif ?? undefined)
  const meaningful = getMeaningfulGpsCoordinates(
    parsed.latitude ?? null,
    parsed.longitude ?? null,
  )

  return {
    capturedAt,
    latitude: meaningful?.latitude ?? null,
    localUri: _uri,
    longitude: meaningful?.longitude ?? null,
  }
}

export async function persistPhotoLocally(
  sourceUri: string,
  filename: string,
): Promise<string> {
  return copyPickerUriToDocuments(sourceUri, filename)
}

export async function getLocalFileByteSize(localUri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(localUri, { size: true })
  if (!info.exists) {
    throw new Error(`Local file is missing or empty: ${localUri}`)
  }

  if (!('size' in info) || info.size <= 0) {
    throw new Error(`Local file is missing or empty: ${localUri}`)
  }

  return info.size
}

export function createPhotoId(): string {
  return createUuid()
}

export async function getCurrentLocation(): Promise<{
  latitude: number
  longitude: number
} | null> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (!permission.granted) {
    return null
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  })

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  }
}

export async function deleteLocalPhotoFiles(
  uris: Array<string | null | undefined>,
): Promise<void> {
  for (const uri of uris) {
    if (uri === null || uri === undefined || uri.trim().length === 0) {
      continue
    }
    await safeDeleteAsync(uri)
  }
}

async function copyPickerUriToDocuments(
  sourceUri: string,
  filename: string,
): Promise<string> {
  const documentDirectory = FileSystem.documentDirectory
  if (documentDirectory === null) {
    throw new Error('Document directory is unavailable')
  }

  const directory = `${documentDirectory}photos`
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  const destination = `${directory}/${filename}`
  await FileSystem.copyAsync({ from: sourceUri, to: destination })

  const info = await FileSystem.getInfoAsync(destination, { size: true })
  if (!info.exists || !('size' in info) || info.size <= 0) {
    throw new Error(
      'Could not copy the selected photo into app storage. The iOS photo URI may have expired.',
    )
  }

  return destination
}

async function normalizeToPersistentJpeg(input: {
  localId: string
  sourceHeight: number
  sourceUri: string
  sourceWidth: number
  targetHeight: number
  targetWidth: number
}): Promise<{ height: number; uri: string; width: number }> {
  try {
    const resizeWidth =
      input.targetWidth >= input.targetHeight ? input.targetWidth : undefined
    const resizeHeight =
      input.targetHeight > input.targetWidth ? input.targetHeight : undefined

    let manipulator = ImageManipulator.manipulate(input.sourceUri)
    if (resizeWidth !== undefined) {
      manipulator = manipulator.resize({ width: resizeWidth })
    } else if (resizeHeight !== undefined) {
      manipulator = manipulator.resize({ height: resizeHeight })
    } else {
      // Already within budget — still re-encode to strip EXIF and normalize JPEG.
      manipulator = manipulator.resize({
        width: Math.max(input.sourceWidth, 1),
      })
    }

    const imageRef = await manipulator.renderAsync()
    const result = await imageRef.saveAsync({
      compress: MASTER_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    })

    const documentDirectory = FileSystem.documentDirectory
    if (documentDirectory === null) {
      throw new Error('Document directory is unavailable')
    }

    const destination = `${documentDirectory}photos/${input.localId}.jpg`
    await FileSystem.copyAsync({ from: result.uri, to: destination })
    await safeDeleteAsync(result.uri)

    const header = await readFileHeaderBytes(destination, 16)
    if (!looksLikeJpegBytes(header)) {
      throw new Error('Normalization did not produce a JPEG file.')
    }

    return {
      height: readPositiveDimension(result.height),
      uri: destination,
      width: readPositiveDimension(result.width),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown normalization error.'
    throw Object.assign(new Error(`Photo normalization failed: ${message}`), {
      stage: 'normalize' as const,
    })
  }
}

export async function generateThumbJpeg(
  masterUri: string,
  localId: string,
  masterWidth: number,
  masterHeight: number,
): Promise<{ height: number; uri: string; width: number }> {
  const plan = resolveThumbDimensions({
    height: masterHeight,
    width: masterWidth,
  })
  return generateDerivativeJpeg({
    compress: PHOTO_VARIANT_POLICY.thumb.jpegQuality,
    emptyError: 'Thumbnail file is empty.',
    localId,
    masterUri,
    suffix: 'thumb',
    targetHeight: plan.height,
    targetWidth: plan.width,
  })
}

export async function generateSmallJpeg(
  masterUri: string,
  localId: string,
  masterWidth: number,
  masterHeight: number,
): Promise<{ height: number; uri: string; width: number }> {
  const plan = resolveSmallDimensions({
    height: masterHeight,
    width: masterWidth,
  })
  return generateDerivativeJpeg({
    compress: PHOTO_VARIANT_POLICY.small.jpegQuality,
    emptyError: 'Small variant file is empty.',
    localId,
    masterUri,
    suffix: 'small',
    targetHeight: plan.height,
    targetWidth: plan.width,
  })
}

export async function generateMediumJpeg(
  masterUri: string,
  localId: string,
  masterWidth: number,
  masterHeight: number,
): Promise<{ height: number; uri: string; width: number }> {
  const plan = resolveMediumDimensions({
    height: masterHeight,
    width: masterWidth,
  })
  return generateDerivativeJpeg({
    compress: PHOTO_VARIANT_POLICY.medium.jpegQuality,
    emptyError: 'Medium variant file is empty.',
    localId,
    masterUri,
    suffix: 'medium',
    targetHeight: plan.height,
    targetWidth: plan.width,
  })
}

async function generateDerivativeJpeg(input: {
  compress: number
  emptyError: string
  localId: string
  masterUri: string
  suffix: 'thumb' | 'small' | 'medium'
  targetHeight: number
  targetWidth: number
}): Promise<{ height: number; uri: string; width: number }> {
  const resizeWidth =
    input.targetWidth >= input.targetHeight ? input.targetWidth : undefined
  const resizeHeight =
    input.targetHeight > input.targetWidth ? input.targetHeight : undefined

  let manipulator = ImageManipulator.manipulate(input.masterUri)
  if (resizeWidth !== undefined) {
    manipulator = manipulator.resize({ width: resizeWidth })
  } else if (resizeHeight !== undefined) {
    manipulator = manipulator.resize({ height: resizeHeight })
  }

  const imageRef = await manipulator.renderAsync()
  const result = await imageRef.saveAsync({
    compress: input.compress,
    format: SaveFormat.JPEG,
  })

  const documentDirectory = FileSystem.documentDirectory
  if (documentDirectory === null) {
    throw new Error('Document directory is unavailable')
  }

  const destination = `${documentDirectory}photos/${input.localId}-${input.suffix}.jpg`
  await FileSystem.copyAsync({ from: result.uri, to: destination })
  await safeDeleteAsync(result.uri)

  const byteSize = await getLocalFileByteSize(destination)
  if (byteSize <= 0) {
    throw new Error(input.emptyError)
  }

  return {
    height: readPositiveDimension(result.height),
    uri: destination,
    width: readPositiveDimension(result.width),
  }
}

async function readFileHeaderBytes(
  localUri: string,
  byteCount: number,
): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
    length: byteCount,
    position: 0,
  })

  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function safeDeleteAsync(uri: string | null): Promise<void> {
  if (uri === null || uri.trim().length === 0) {
    return
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch {
    // Best-effort cleanup of staging files.
  }
}

async function ensureMediaLibraryPermission(): Promise<ImagePicker.MediaLibraryPermissionResponse> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync()
  if (current.granted) {
    return current
  }

  return ImagePicker.requestMediaLibraryPermissionsAsync()
}

async function ensureCameraPermission(): Promise<ImagePicker.CameraPermissionResponse> {
  const current = await ImagePicker.getCameraPermissionsAsync()
  if (current.granted) {
    return current
  }

  return ImagePicker.requestCameraPermissionsAsync()
}

function logPhotoPickDev(
  source: 'library' | 'camera',
  permission:
    | ImagePicker.MediaLibraryPermissionResponse
    | ImagePicker.CameraPermissionResponse,
  result: ImagePicker.ImagePickerResult,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return
  }

  console.log('[photo-picker]', {
    accessPrivileges:
      'accessPrivileges' in permission
        ? permission.accessPrivileges
        : undefined,
    assetCount: result.canceled ? 0 : result.assets.length,
    canceled: result.canceled,
    granted: permission.granted,
    source,
    status: permission.status,
  })
}

function readExifTimestamp(
  exif: Record<string, unknown> | null,
): string | null {
  if (exif === null) {
    return null
  }

  const dateTime =
    exif.DateTimeOriginal ?? exif.DateTime ?? exif.dateTimeOriginal ?? null

  return typeof dateTime === 'string' ? dateTime : null
}

function readPositiveDimension(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 1
}

function readUriScheme(uri: string): string {
  const trimmed = uri.trim()
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)
  return match?.[1]?.toLowerCase() ?? 'unknown'
}

function inferFailedStage(message: string): MediaPrepareStage {
  const normalized = message.toLowerCase()
  if (normalized.includes('permission')) {
    return 'permission'
  }
  if (normalized.includes('copy') || normalized.includes('uri')) {
    return 'copy'
  }
  if (normalized.includes('thumb') || normalized.includes('small')) {
    return 'thumb'
  }
  if (
    normalized.includes('normaliz') ||
    normalized.includes('heic') ||
    normalized.includes('convert')
  ) {
    return 'normalize'
  }
  return 'validate'
}
