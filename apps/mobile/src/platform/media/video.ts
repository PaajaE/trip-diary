import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import * as VideoThumbnails from 'expo-video-thumbnails'
import {
  looksLikeMp4Bytes,
  VIDEO_MAX_CANONICAL_BYTES,
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_POSTER_TIME_MS,
} from '@trip-diary/utils'
import { createUuid } from '@/platform/id'
import {
  extractPhotoMetadata,
  generateSmallJpeg,
  generateThumbJpeg,
  getLocalFileByteSize,
  type MediaPrepareStage,
  type PhotoMetadata,
  type PickedPhotoDiagnostics,
  type PickedPhotoStatus,
} from '@/platform/media/photo'

export type VideoMimeType = 'video/mp4'

export interface PickedVideo {
  diagnostics: PickedPhotoDiagnostics
  durationMs: number
  height: number
  localId: string
  mediaType: 'video'
  metadata: PhotoMetadata
  mimeType: VideoMimeType
  smallUri: string | null
  status: PickedPhotoStatus
  thumbUri: string | null
  uri: string
  width: number
}

export type PickVideosStatus = 'selected' | 'canceled' | 'empty'

export interface PickVideosResult {
  status: PickVideosStatus
  videos: PickedVideo[]
}

const videoLibraryOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  allowsMultipleSelection: true,
  mediaTypes: ['videos'],
  orderedSelection: true,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
  selectionLimit: 0,
  videoExportPreset: ImagePicker.VideoExportPreset.H264_1920x1080,
  videoMaxDuration: VIDEO_MAX_DURATION_SECONDS,
}

export interface PickVideosOptions {
  onItemPrepared?: (video: PickedVideo) => Promise<void>
}

export async function pickVideos(
  options: PickVideosOptions = {},
): Promise<PickVideosResult> {
  const permission = await ensureMediaLibraryPermission()
  if (!permission.granted) {
    throw new Error('Photo library permission is required')
  }

  const result = await ImagePicker.launchImageLibraryAsync(videoLibraryOptions)

  if (result.canceled) {
    return { status: 'canceled', videos: [] }
  }

  if (result.assets.length === 0) {
    return { status: 'empty', videos: [] }
  }

  const videos: PickedVideo[] = []
  for (const asset of result.assets) {
    const prepared = await materializePickedVideoAssetSafe(asset)
    if (options.onItemPrepared !== undefined) {
      await options.onItemPrepared(prepared)
    }
    videos.push(prepared)
  }

  const anyReady = videos.some((video) => video.status === 'ready')
  return {
    status: anyReady || videos.length > 0 ? 'selected' : 'empty',
    videos,
  }
}

export function isVideoPickerAsset(
  asset: ImagePicker.ImagePickerAsset,
): boolean {
  if (asset.type === 'video' || asset.type === 'pairedVideo') {
    return true
  }

  const mime = typeof asset.mimeType === 'string' ? asset.mimeType.trim() : ''
  return mime.toLowerCase().startsWith('video/')
}

export async function materializePickedVideoAssetSafe(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickedVideo> {
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
    return createFailedPickedVideo(
      localId,
      baseDiagnostics,
      'Selected video has an empty URI.',
      'copy',
      readDurationMs(asset),
    )
  }

  try {
    return await materializePickedVideoAsset(asset, localId, baseDiagnostics)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Video could not be prepared.'
    const stage = inferVideoFailedStage(message)
    console.warn('[video-picker] materialize failed', {
      localId,
      message,
      scheme: baseDiagnostics.sourceUriScheme,
      stage,
    })
    return createFailedPickedVideo(
      localId,
      baseDiagnostics,
      message,
      stage,
      readDurationMs(asset),
    )
  }
}

export async function materializePickedVideoAsset(
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
): Promise<PickedVideo> {
  if (typeof asset.uri !== 'string' || asset.uri.trim().length === 0) {
    throw Object.assign(new Error('Selected video has an empty URI.'), {
      stage: 'copy' as const,
    })
  }

  const durationMs = readDurationMs(asset)
  if (durationMs > VIDEO_MAX_DURATION_SECONDS * 1000) {
    throw Object.assign(
      new Error(
        `Video exceeds maximum duration (${String(VIDEO_MAX_DURATION_SECONDS)} seconds).`,
      ),
      { stage: 'validate' as const },
    )
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
      error instanceof Error ? error.message : 'Could not copy selected video.'
    throw Object.assign(new Error(message), { stage: 'copy' as const })
  }

  try {
    const originalByteSize = await getLocalFileByteSize(stagingUri)
    diagnostics.originalByteSize = originalByteSize

    const header = await readFileHeaderBytes(stagingUri, 16)
    if (!looksLikeMp4Bytes(header)) {
      throw Object.assign(
        new Error(
          'Selected file is not a valid MP4 container. HEVC/MOV sources must export as H.264 MP4.',
        ),
        { stage: 'validate' as const },
      )
    }

    const canonicalUri = await persistCanonicalMp4(stagingUri, localId)
    const canonicalByteSize = await getLocalFileByteSize(canonicalUri)
    if (canonicalByteSize <= 0) {
      throw Object.assign(new Error('Video file is empty.'), {
        stage: 'validate' as const,
      })
    }

    if (canonicalByteSize > VIDEO_MAX_CANONICAL_BYTES) {
      throw Object.assign(
        new Error(
          `Video exceeds upload limit (${String(VIDEO_MAX_CANONICAL_BYTES)} bytes): ${String(canonicalByteSize)} bytes.`,
        ),
        { stage: 'validate' as const },
      )
    }

    const sourceWidth = readPositiveDimension(asset.width)
    const sourceHeight = readPositiveDimension(asset.height)

    let posterUri: string | null = null
    let posterWidth = sourceWidth
    let posterHeight = sourceHeight
    try {
      const poster = await extractVideoPosterFrame(canonicalUri, localId)
      posterUri = poster.uri
      posterWidth = poster.width
      posterHeight = poster.height
    } catch (posterError) {
      const message =
        posterError instanceof Error
          ? posterError.message
          : 'Poster frame extraction failed.'
      throw Object.assign(new Error(message), { stage: 'thumb' as const })
    }

    let smallUri: string | null = null
    try {
      const small = await generateSmallJpeg(
        posterUri,
        localId,
        posterWidth,
        posterHeight,
      )
      smallUri = small.uri
    } catch (smallError) {
      const message =
        smallError instanceof Error
          ? smallError.message
          : 'Small poster variant failed.'
      console.warn('[video-picker] small failed', { localId, message })
    }

    let thumbUri: string | null = null
    try {
      const thumb = await generateThumbJpeg(
        posterUri,
        localId,
        posterWidth,
        posterHeight,
      )
      thumbUri = thumb.uri
    } catch (thumbError) {
      const message =
        thumbError instanceof Error
          ? thumbError.message
          : 'Thumb poster variant failed.'
      console.warn('[video-picker] thumb failed', { localId, message })
    }

    await safeDeleteAsync(posterUri)

    return {
      diagnostics: {
        ...diagnostics,
        failedStage: null,
        lastError: null,
        normalizedByteSize: canonicalByteSize,
        normalizedHeight: posterHeight,
        normalizedWidth: posterWidth,
        originalByteSize,
        sourceHeight,
        sourceWidth,
      },
      durationMs,
      height: posterHeight,
      localId,
      mediaType: 'video',
      metadata: {
        ...metadataFromExif,
        localUri: canonicalUri,
      },
      mimeType: 'video/mp4',
      smallUri,
      status: 'ready',
      thumbUri,
      uri: canonicalUri,
      width: posterWidth,
    }
  } finally {
    if (!stagingUri.endsWith(`/${localId}.mp4`)) {
      await safeDeleteAsync(stagingUri)
    }
  }
}

function createFailedPickedVideo(
  localId: string,
  diagnostics: PickedPhotoDiagnostics,
  message: string,
  stage: MediaPrepareStage,
  durationMs: number,
): PickedVideo {
  return {
    diagnostics: {
      ...diagnostics,
      failedStage: stage,
      lastError: message,
    },
    durationMs,
    height: diagnostics.sourceHeight ?? 1,
    localId,
    mediaType: 'video',
    metadata: {
      capturedAt: null,
      latitude: null,
      localUri: '',
      longitude: null,
    },
    mimeType: 'video/mp4',
    smallUri: null,
    status: 'failed',
    thumbUri: null,
    uri: '',
    width: diagnostics.sourceWidth ?? 1,
  }
}

async function extractVideoPosterFrame(
  videoUri: string,
  localId: string,
): Promise<{ height: number; uri: string; width: number }> {
  const { height, uri, width } = await VideoThumbnails.getThumbnailAsync(
    videoUri,
    { time: VIDEO_POSTER_TIME_MS },
  )

  const documentDirectory = FileSystem.documentDirectory
  if (documentDirectory === null) {
    throw new Error('Document directory is unavailable')
  }

  const destination = `${documentDirectory}photos/${localId}-poster.jpg`
  await FileSystem.copyAsync({ from: uri, to: destination })
  await safeDeleteAsync(uri)

  const byteSize = await getLocalFileByteSize(destination)
  if (byteSize <= 0) {
    throw new Error('Poster frame file is empty.')
  }

  return {
    height: readPositiveDimension(height),
    uri: destination,
    width: readPositiveDimension(width),
  }
}

async function persistCanonicalMp4(
  stagingUri: string,
  localId: string,
): Promise<string> {
  const documentDirectory = FileSystem.documentDirectory
  if (documentDirectory === null) {
    throw new Error('Document directory is unavailable')
  }

  const destination = `${documentDirectory}photos/${localId}.mp4`
  await FileSystem.copyAsync({ from: stagingUri, to: destination })

  const info = await FileSystem.getInfoAsync(destination, { size: true })
  if (!info.exists || !('size' in info) || info.size <= 0) {
    throw new Error('Could not persist the selected video into app storage.')
  }

  return destination
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
      'Could not copy the selected video into app storage. The iOS photo URI may have expired.',
    )
  }

  return destination
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

function readDurationMs(asset: ImagePicker.ImagePickerAsset): number {
  if (
    typeof asset.duration === 'number' &&
    Number.isFinite(asset.duration) &&
    asset.duration > 0
  ) {
    return Math.round(asset.duration)
  }

  return 0
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

function inferVideoFailedStage(message: string): MediaPrepareStage {
  const normalized = message.toLowerCase()
  if (normalized.includes('permission')) {
    return 'permission'
  }
  if (normalized.includes('copy') || normalized.includes('uri')) {
    return 'copy'
  }
  if (
    normalized.includes('poster') ||
    normalized.includes('thumb') ||
    normalized.includes('small')
  ) {
    return 'thumb'
  }
  return 'validate'
}
