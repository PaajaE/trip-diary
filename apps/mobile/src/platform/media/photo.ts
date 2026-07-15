import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'

export interface PhotoMetadata {
  capturedAt: string | null
  latitude: number | null
  localUri: string
  longitude: number | null
}

export interface PickedPhoto {
  height: number
  metadata: PhotoMetadata
  mimeType: PhotoMimeType
  uri: string
  width: number
}

export type PhotoMimeType = 'image/jpeg' | 'image/webp'

async function pickImageFromSource(
  source: 'library' | 'camera',
): Promise<PickedPhoto | null> {
  const permission =
    source === 'library'
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) {
    throw new Error(
      source === 'library'
        ? 'Photo library permission is required'
        : 'Camera permission is required',
    )
  }

  const result =
    source === 'library'
      ? await ImagePicker.launchImageLibraryAsync({
          allowsEditing: false,
          mediaTypes: ['images'],
          quality: 0.9,
        })
      : await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          mediaTypes: ['images'],
          quality: 0.9,
        })

  if (result.canceled || result.assets.length === 0) {
    return null
  }

  const asset = result.assets[0]
  const metadata = await extractPhotoMetadata(asset.uri, asset.exif ?? null)

  return {
    height: readPositiveDimension(asset.height),
    metadata,
    mimeType: readPhotoMimeType(asset.mimeType),
    uri: asset.uri,
    width: readPositiveDimension(asset.width),
  }
}

export async function pickPhoto(): Promise<PickedPhoto | null> {
  return pickImageFromSource('library')
}

export async function capturePhoto(): Promise<PickedPhoto | null> {
  return pickImageFromSource('camera')
}

export async function extractPhotoMetadata(
  _uri: string,
  exif: Record<string, unknown> | null,
): Promise<PhotoMetadata> {
  const capturedAt = readExifTimestamp(exif)
  const { latitude, longitude } = readExifCoordinates(exif)

  return {
    capturedAt,
    latitude,
    localUri: _uri,
    longitude,
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
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  throw new Error('Secure photo ID generation is unavailable in this runtime.')
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

function readExifCoordinates(exif: Record<string, unknown> | null): {
  latitude: number | null
  longitude: number | null
} {
  if (exif === null) {
    return { latitude: null, longitude: null }
  }

  const latitude = toNumber(exif.GPSLatitude ?? exif.latitude)
  const longitude = toNumber(exif.GPSLongitude ?? exif.longitude)

  return { latitude, longitude }
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readPositiveDimension(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 1
}

function readPhotoMimeType(value: string | undefined): PhotoMimeType {
  if (value === 'image/webp') {
    return value
  }

  return 'image/jpeg'
}
