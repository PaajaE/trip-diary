import * as FileSystem from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import {
  getMeaningfulGpsCoordinates,
  isHeicLikeImageInput,
  looksLikeHeicBytes,
  looksLikeJpegBytes,
  parseNativeExifGps,
} from '@trip-diary/utils'
import { createUuid } from '@/platform/id'
import { PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES } from '@/platform/sync/photo-storage-limits'

export interface PhotoMetadata {
  capturedAt: string | null
  latitude: number | null
  localUri: string
  longitude: number | null
}

export interface PickedPhoto {
  height: number
  localId: string
  metadata: PhotoMetadata
  mimeType: PhotoMimeType
  uri: string
  width: number
}

export type PhotoMimeType = 'image/jpeg' | 'image/webp'

export type PickPhotosStatus = 'selected' | 'canceled' | 'empty'

export interface PickPhotosResult {
  photos: PickedPhoto[]
  status: PickPhotosStatus
}

const MAX_JPEG_EDGE = 2560
const JPEG_COMPRESS_QUALITY = 0.82

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

async function pickImageFromSource(
  source: 'library' | 'camera',
): Promise<PickedPhoto | null> {
  const result = await pickPhotosFromSource(source)
  return result.photos[0] ?? null
}

async function pickPhotosFromSource(
  source: 'library' | 'camera',
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

  const picked: PickedPhoto[] = []
  const failures: string[] = []

  for (const asset of result.assets) {
    try {
      // Copy/convert while the picker result is still valid — never queue a
      // temporary ph:// or short-lived file:// URI for later background work.
      const materialized = await materializePickedAsset(asset)
      picked.push(materialized)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Photo could not be prepared.'
      failures.push(message)
      console.warn('[photo-picker] materialize failed', message)
    }
  }

  if (picked.length === 0 && failures.length > 0) {
    throw new Error(failures[0] ?? 'Selected photos could not be prepared.')
  }

  return {
    photos: picked,
    status: picked.length > 0 ? 'selected' : 'empty',
  }
}

export async function pickPhoto(): Promise<PickedPhoto | null> {
  const result = await pickPhotos()
  return result.photos[0] ?? null
}

export async function pickPhotos(): Promise<PickPhotosResult> {
  await ensureMediaLibraryPermission()
  return pickPhotosFromSource('library')
}

export async function capturePhoto(): Promise<PickedPhoto | null> {
  return pickImageFromSource('camera')
}

/**
 * Persist a picker asset into app-owned storage as a real JPEG, preserving
 * EXIF-derived GPS/date in metadata even when the JPEG no longer embeds them.
 */
export async function materializePickedAsset(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickedPhoto> {
  if (typeof asset.uri !== 'string' || asset.uri.trim().length === 0) {
    throw new Error('Selected photo has an empty URI.')
  }

  const localId = createUuid()
  const metadataFromExif = await extractPhotoMetadata(
    asset.uri,
    asset.exif ?? null,
  )

  const stagingFilename = `staging-${localId}`
  const stagingUri = await copyPickerUriToDocuments(asset.uri, stagingFilename)

  try {
    const needsJpegConversion = await detectNeedsJpegConversion(
      asset,
      stagingUri,
    )

    const prepared = needsJpegConversion
      ? await convertToPersistentJpeg(stagingUri, localId)
      : await ensurePersistentJpegCopy(stagingUri, localId, asset)

    const byteSize = await getLocalFileByteSize(prepared.uri)
    if (byteSize <= 0) {
      throw new Error('Prepared photo file is empty.')
    }

    if (byteSize > PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES) {
      const resized = await convertToPersistentJpeg(prepared.uri, localId)
      await safeDeleteAsync(prepared.uri === stagingUri ? null : prepared.uri)

      return {
        height: resized.height,
        localId,
        metadata: {
          ...metadataFromExif,
          localUri: resized.uri,
        },
        mimeType: 'image/jpeg',
        uri: resized.uri,
        width: resized.width,
      }
    }

    return {
      height: prepared.height,
      localId,
      metadata: {
        ...metadataFromExif,
        localUri: prepared.uri,
      },
      mimeType: 'image/jpeg',
      uri: prepared.uri,
      width: prepared.width,
    }
  } finally {
    if (!stagingUri.endsWith(`/${localId}.jpg`)) {
      await safeDeleteAsync(stagingUri)
    }
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

async function detectNeedsJpegConversion(
  asset: ImagePicker.ImagePickerAsset,
  localUri: string,
): Promise<boolean> {
  if (
    isHeicLikeImageInput({
      mimeType: asset.mimeType,
      nameOrUri: asset.uri,
    }) ||
    isHeicLikeImageInput({
      mimeType: asset.mimeType,
      nameOrUri: localUri,
    })
  ) {
    return true
  }

  const header = await readFileHeaderBytes(localUri, 16)
  if (looksLikeHeicBytes(header)) {
    return true
  }

  if (looksLikeJpegBytes(header)) {
    return false
  }

  // Unknown container — force a JPEG re-encode so Storage always gets JPEG.
  return true
}

async function ensurePersistentJpegCopy(
  stagingUri: string,
  localId: string,
  asset: ImagePicker.ImagePickerAsset,
): Promise<{ height: number; uri: string; width: number }> {
  const header = await readFileHeaderBytes(stagingUri, 16)
  if (!looksLikeJpegBytes(header)) {
    return convertToPersistentJpeg(stagingUri, localId)
  }

  const documentDirectory = FileSystem.documentDirectory
  if (documentDirectory === null) {
    throw new Error('Document directory is unavailable')
  }

  const destination = `${documentDirectory}photos/${localId}.jpg`
  await FileSystem.copyAsync({ from: stagingUri, to: destination })

  return {
    height: readPositiveDimension(asset.height),
    uri: destination,
    width: readPositiveDimension(asset.width),
  }
}

async function convertToPersistentJpeg(
  sourceUri: string,
  localId: string,
): Promise<{ height: number; uri: string; width: number }> {
  try {
    const imageRef = await ImageManipulator.manipulate(sourceUri)
      .resize({ width: MAX_JPEG_EDGE })
      .renderAsync()
    const result = await imageRef.saveAsync({
      compress: JPEG_COMPRESS_QUALITY,
      format: SaveFormat.JPEG,
    })

    const documentDirectory = FileSystem.documentDirectory
    if (documentDirectory === null) {
      throw new Error('Document directory is unavailable')
    }

    const destination = `${documentDirectory}photos/${localId}.jpg`
    await FileSystem.copyAsync({ from: result.uri, to: destination })
    await safeDeleteAsync(result.uri)

    const header = await readFileHeaderBytes(destination, 16)
    if (!looksLikeJpegBytes(header)) {
      throw new Error('HEIC conversion did not produce a JPEG file.')
    }

    const byteSize = await getLocalFileByteSize(destination)
    if (byteSize <= 0) {
      throw new Error('HEIC conversion produced an empty JPEG file.')
    }

    return {
      height: readPositiveDimension(result.height),
      uri: destination,
      width: readPositiveDimension(result.width),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown conversion error.'
    throw new Error(
      `HEIC/HEIF conversion to JPEG failed: ${message}`,
    )
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
  if (!__DEV__) {
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

function readPositiveDimension(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 1
}
