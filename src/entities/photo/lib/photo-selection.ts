import { Camera, MediaType, MediaTypeSelection } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import type {
  PhotoMetadataOverride,
  SelectedPhotoFile,
} from '@/entities/photo/lib/process-photo'

interface PhotoFilePickerHandle {
  getFile: () => Promise<File>
}

interface PhotoFilePickerOptions {
  excludeAcceptAllOption?: boolean
  multiple?: boolean
  types?: {
    accept: Record<string, string[]>
    description: string
  }[]
}

interface FilePickerCapableWindow extends Window {
  showOpenFilePicker?: (
    options?: PhotoFilePickerOptions,
  ) => Promise<PhotoFilePickerHandle[]>
}

export function supportsNativePhotoSelection() {
  return Capacitor.isNativePlatform()
}

export function createSelectedPhotos(files: File[]): SelectedPhotoFile[] {
  return files.map((file) => ({ file }))
}

export function supportsFileSystemPhotoSelection() {
  const pickerWindow = window as FilePickerCapableWindow
  return (
    typeof window !== 'undefined' &&
    typeof pickerWindow.showOpenFilePicker === 'function'
  )
}

export async function choosePhotosFromFiles(): Promise<SelectedPhotoFile[]> {
  if (!supportsFileSystemPhotoSelection()) {
    throw new Error('File system picker is not available')
  }

  const pickerWindow = window as FilePickerCapableWindow
  const openFilePicker = pickerWindow.showOpenFilePicker

  if (openFilePicker === undefined) {
    throw new Error('File system picker is not available')
  }

  const handles = await openFilePicker({
    excludeAcceptAllOption: true,
    multiple: true,
    types: [
      {
        accept: {
          'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'],
        },
        description: 'Images',
      },
    ],
  })

  const files = await Promise.all(handles.map((handle) => handle.getFile()))
  return createSelectedPhotos(files)
}

export async function choosePhotosFromGallery(): Promise<SelectedPhotoFile[]> {
  const { results } = await Camera.chooseFromGallery({
    allowMultipleSelection: true,
    correctOrientation: true,
    includeMetadata: true,
    mediaType: MediaTypeSelection.Photo,
    quality: 100,
  })

  const selectedPhotos = await Promise.all(
    results
      .filter((result) => result.type === MediaType.Photo)
      .map((result) => mediaResultToSelectedPhoto(result)),
  )

  return selectedPhotos
}

async function mediaResultToSelectedPhoto(
  result: Awaited<
    ReturnType<typeof Camera.chooseFromGallery>
  >['results'][number],
): Promise<SelectedPhotoFile> {
  if (result.webPath === undefined) {
    throw new Error('Missing selected photo path')
  }

  const response = await fetch(result.webPath)
  if (!response.ok) {
    throw new Error('Selected photo could not be loaded')
  }

  const blob = await response.blob()
  const name = deriveFileName(result.webPath, result.metadata?.format)
  const file = new File([blob], name, {
    lastModified: parseCapturedAt(result.metadata?.creationDate) ?? Date.now(),
    type: blob.type === '' ? inferMimeType(result.metadata?.format) : blob.type,
  })

  const metadata = extractMetadataOverride(result.metadata)

  return metadata === undefined ? { file } : { file, metadata }
}

function extractMetadataOverride(
  metadata: {
    creationDate?: string
    exif?: string
  } = {},
): PhotoMetadataOverride | undefined {
  const gps = parseNativeExifGps(metadata.exif)
  const capturedAt = normalizeCapturedAt(metadata.creationDate)
  const latitude = isValidLatitude(gps.latitude) ? gps.latitude : undefined
  const longitude = isValidLongitude(gps.longitude) ? gps.longitude : undefined

  if (
    capturedAt === undefined &&
    latitude === undefined &&
    longitude === undefined
  ) {
    return undefined
  }

  return {
    ...(capturedAt === undefined ? {} : { capturedAt }),
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
  }
}

function parseNativeExifGps(exif: string | undefined) {
  if (exif === undefined) {
    return {}
  }

  const parsed = safeJsonParse(exif)
  if (parsed === undefined) {
    return {}
  }

  const latitude = readCoordinate(parsed, ['latitude', 'gpslatitude'])
  const longitude = readCoordinate(parsed, ['longitude', 'gpslongitude'])

  return {
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
  }
}

function readCoordinate(source: unknown, keys: string[]): number | undefined {
  const coordinate = findValue(source, (key) => keys.includes(key))
  const reference = findValue(
    source,
    (key) =>
      (keys.includes('latitude') && key === 'gpslatituderef') ||
      (keys.includes('longitude') && key === 'gpslongituderef'),
  )

  return normalizeCoordinate(coordinate, reference)
}

function findValue(
  source: unknown,
  matches: (normalizedKey: string) => boolean,
): unknown {
  if (source === null || typeof source !== 'object') {
    return undefined
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const match = findValue(item, matches)
      if (match !== undefined) {
        return match
      }
    }
    return undefined
  }

  for (const [key, value] of Object.entries(source)) {
    if (matches(key.toLowerCase())) {
      return value
    }
    const nested = findValue(value, matches)
    if (nested !== undefined) {
      return nested
    }
  }

  return undefined
}

function normalizeCoordinate(
  value: unknown,
  reference: unknown,
): number | undefined {
  const ref =
    typeof reference === 'string' && reference.length > 0
      ? reference.toUpperCase()
      : undefined

  if (typeof value === 'number' && Number.isFinite(value)) {
    return applyCoordinateReference(value, ref)
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return applyCoordinateReference(parsed, ref)
    }
  }

  if (Array.isArray(value) && value.length >= 3) {
    const [degrees, minutes, seconds] = value as unknown[]
    const decimal = convertDmsToDecimal(degrees, minutes, seconds)
    return decimal === undefined
      ? undefined
      : applyCoordinateReference(decimal, ref)
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const decimal = convertDmsToDecimal(
      source.degrees ?? source.degree ?? source[0],
      source.minutes ?? source.minute ?? source[1],
      source.seconds ?? source.second ?? source[2],
    )
    return decimal === undefined
      ? undefined
      : applyCoordinateReference(decimal, ref)
  }

  return undefined
}

function convertDmsToDecimal(
  degreesValue: unknown,
  minutesValue: unknown,
  secondsValue: unknown,
) {
  const degrees = normalizeNumber(degreesValue)
  const minutes = normalizeNumber(minutesValue)
  const seconds = normalizeNumber(secondsValue)

  if (degrees === undefined || minutes === undefined || seconds === undefined) {
    return undefined
  }

  return Math.abs(degrees) + minutes / 60 + seconds / 3600
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.includes('/')) {
      const [numerator, denominator] = trimmed.split('/')
      const top = Number(numerator)
      const bottom = Number(denominator)
      if (Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0) {
        return top / bottom
      }
      return undefined
    }

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function applyCoordinateReference(
  value: number,
  reference: string | undefined,
) {
  if (reference === 'S' || reference === 'W') {
    return -Math.abs(value)
  }

  return value
}

function isValidLatitude(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && Math.abs(value) <= 90
}

function isValidLongitude(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && Math.abs(value) <= 180
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function deriveFileName(webPath: string, format: string | undefined) {
  const pathName = new URL(webPath).pathname
  const baseName = pathName.split('/').pop()
  if (baseName?.includes('.')) {
    return decodeURIComponent(baseName)
  }

  return `photo-${crypto.randomUUID()}.${inferExtension(format)}`
}

function inferExtension(format: string | undefined) {
  if (format === undefined || format.trim() === '') {
    return 'jpg'
  }

  return format.toLowerCase() === 'jpeg' ? 'jpg' : format.toLowerCase()
}

function inferMimeType(format: string | undefined) {
  const extension = inferExtension(format)
  return extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
}

function normalizeCapturedAt(value: string | undefined) {
  if (value === undefined) {
    return undefined
  }

  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? null : date.toISOString()
}

function parseCapturedAt(value: string | undefined) {
  if (value === undefined) {
    return undefined
  }

  const timestamp = new Date(value).valueOf()
  return Number.isNaN(timestamp) ? undefined : timestamp
}
