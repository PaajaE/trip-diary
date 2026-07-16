import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import {
  getMeaningfulGpsCoordinates,
  parseNativeExifGps,
} from '@trip-diary/utils'
import { createUuid } from '@/platform/id'

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
  for (const asset of result.assets) {
    const metadata = await extractPhotoMetadata(asset.uri, asset.exif ?? null)
    const mimeType = readPhotoMimeType(asset.mimeType, asset.uri)
    if (
      __DEV__ &&
      (asset.mimeType?.includes('heic') || asset.mimeType?.includes('heif'))
    ) {
      console.log('[photo-picker] HEIC/HEIF source detected', {
        convertedMime: mimeType,
        sourceMime: asset.mimeType,
        uriSuffix: asset.uri.slice(-24),
      })
    }
    picked.push({
      height: readPositiveDimension(asset.height),
      localId: createUuid(),
      metadata,
      mimeType,
      uri: asset.uri,
      width: readPositiveDimension(asset.width),
    })
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
  const documentDirectory = FileSystem.documentDirectory
  if (documentDirectory === null) {
    throw new Error('Document directory is unavailable')
  }

  const directory = `${documentDirectory}photos`
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  const destination = `${directory}/${filename}`
  await FileSystem.copyAsync({ from: sourceUri, to: destination })
  return destination
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

function readPhotoMimeType(
  value: string | undefined,
  uri: string,
): PhotoMimeType {
  const lowerUri = uri.toLowerCase()
  // Compatible mode should rewrite HEIC to a JPEG URI. Reject remaining HEIC paths.
  if (
    lowerUri.endsWith('.heic') ||
    lowerUri.endsWith('.heif') ||
    lowerUri.includes('.heic?') ||
    lowerUri.includes('.heif?')
  ) {
    throw new Error(
      'HEIC/HEIF is not a supported upload path. Convert to JPEG first.',
    )
  }

  if (value === 'image/webp' || lowerUri.endsWith('.webp')) {
    return 'image/webp'
  }

  return 'image/jpeg'
}
