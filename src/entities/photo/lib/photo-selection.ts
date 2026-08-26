import { Camera, MediaType, MediaTypeSelection } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { FilePicker, type PickedFile } from '@capawesome/capacitor-file-picker'
import exifr from 'exifr'
import {
  getMeaningfulGpsCoordinates,
  isMeaningfulGpsCoordinate,
  parseNativeExifGps,
} from '@/entities/photo/lib/photo-exif-gps'
import type {
  PhotoMetadataOverride,
  SelectedPhotoFile,
} from '@/entities/photo/lib/process-photo'
import {
  materializeNativePhoto,
  readMaterializedPhotoMetadata,
  readNativePhotoGps,
  requestNativePhotoPermissions,
} from '@/shared/lib/native-photo'

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

type CapacitorGalleryResult = Awaited<
  ReturnType<typeof Camera.chooseFromGallery>
>['results'][number]

export function supportsNativePhotoSelection() {
  return Capacitor.isNativePlatform()
}

export function createSelectedPhotos(files: File[]): SelectedPhotoFile[] {
  return files.map((file) => ({ file }))
}

/** Web `<input type="file">` accept list for photos and MP4 video. */
export const WEB_PHOTO_VIDEO_ACCEPT =
  'image/*,video/mp4,.mp4,video/quicktime,.mov'

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
          'video/mp4': ['.mp4'],
          'video/quicktime': ['.mov'],
        },
        description: 'Photos and videos',
      },
    ],
  })

  const files = await Promise.all(handles.map((handle) => handle.getFile()))
  return createSelectedPhotos(files)
}

export async function choosePhotosFromGallery(): Promise<SelectedPhotoFile[]> {
  if (Capacitor.getPlatform() === 'android') {
    await requestAndroidPhotoPermissions()
    return choosePhotosFromAndroidFilePicker()
  }

  return choosePhotosFromCapacitorGallery()
}

async function requestAndroidPhotoPermissions() {
  try {
    await requestNativePhotoPermissions()
  } catch {
    // Permission request failed; picker may still work.
  }
}

async function choosePhotosFromAndroidFilePicker(): Promise<
  SelectedPhotoFile[]
> {
  let files: PickedFile[]

  try {
    ;({ files } = await FilePicker.pickImages({
      limit: 0,
      readData: false,
    }))
  } catch (error) {
    if (isFilePickerCancelled(error)) {
      return []
    }

    try {
      ;({ files } = await FilePicker.pickFiles({
        limit: 0,
        readData: false,
        types: ['image/*'],
      }))
    } catch (fallbackError) {
      if (isFilePickerCancelled(fallbackError)) {
        return []
      }

      throw fallbackError
    }
  }

  if (files.length === 0) {
    return []
  }

  const settled = await Promise.allSettled(
    files.map((file) => pickedFileToSelectedPhoto(file)),
  )

  const photos = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )

  if (photos.length === 0 && files.length > 0) {
    const firstFailure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    throw (
      firstFailure?.reason ?? new Error('Selected photo could not be loaded')
    )
  }

  return photos
}

async function choosePhotosFromCapacitorGallery(): Promise<
  SelectedPhotoFile[]
> {
  let results: CapacitorGalleryResult[]

  try {
    ;({ results } = await Camera.chooseFromGallery({
      allowMultipleSelection: true,
      correctOrientation: true,
      includeMetadata: true,
      mediaType: MediaTypeSelection.Photo,
      quality: 100,
    }))
  } catch (error) {
    if (isPickerCancelled(error)) {
      return []
    }
    throw error
  }

  const photoResults = results.filter(isPhotoMediaResult)
  if (photoResults.length === 0) {
    return []
  }

  const settled = await Promise.allSettled(
    photoResults.map((result) => mediaResultToSelectedPhoto(result)),
  )

  const photos = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )

  if (photos.length === 0 && photoResults.length > 0) {
    throw new Error('Selected photo could not be loaded')
  }

  return photos
}

function isPhotoMediaResult(result: CapacitorGalleryResult) {
  const type = result.type as unknown
  return type === MediaType.Photo || type === 0 || type === 'Photo'
}

function isPickerCancelled(error: unknown) {
  if (error === null || typeof error !== 'object') {
    return false
  }

  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : ''
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : ''

  return (
    message.includes('cancel') ||
    code === 'OS-PLUG-CAMR-0020' ||
    code === 'OS-PLUG-CAMR-0006'
  )
}

function isFilePickerCancelled(error: unknown) {
  if (error === null || typeof error !== 'object') {
    return false
  }

  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : ''

  return message.includes('cancel')
}

async function pickedFileToSelectedPhoto(
  picked: PickedFile,
): Promise<SelectedPhotoFile> {
  const loaded = await loadPickedFileBlob(picked)
  const mimeType =
    loaded.mimeType ??
    (picked.mimeType === ''
      ? inferMimeTypeFromName(picked.name)
      : picked.mimeType)
  const file = new File([loaded.blob], picked.name, {
    lastModified: picked.modifiedAt ?? Date.now(),
    type: mimeType,
  })
  const capturedAt =
    loaded.metadata?.capturedAt ??
    normalizeCapturedAtFromTimestamp(picked.modifiedAt)
  const metadata = await buildSelectedPhotoMetadata({
    file,
    ...(capturedAt === undefined ? {} : { capturedAt }),
    ...(loaded.metadata?.latitude !== undefined &&
    loaded.metadata.latitude !== null &&
    loaded.metadata.longitude !== undefined &&
    loaded.metadata.longitude !== null
      ? {
          latitude: loaded.metadata.latitude,
          longitude: loaded.metadata.longitude,
        }
      : {}),
    ...(picked.path === undefined ? {} : { sourceUri: picked.path }),
  })

  return metadata === undefined ? { file } : { file, metadata }
}

async function mediaResultToSelectedPhoto(
  result: CapacitorGalleryResult,
): Promise<SelectedPhotoFile> {
  const blob = await loadCapacitorMediaBlob(result)
  const name = deriveFileName(
    result.webPath ?? result.uri ?? 'photo.jpg',
    result.metadata?.format,
  )
  const file = new File([blob], name, {
    lastModified: parseCapturedAt(result.metadata?.creationDate) ?? Date.now(),
    type: blob.type === '' ? inferMimeType(result.metadata?.format) : blob.type,
  })

  const capturedAt = normalizeCapturedAt(result.metadata?.creationDate)
  const metadata = await buildSelectedPhotoMetadata({
    file,
    ...(capturedAt === undefined ? {} : { capturedAt }),
    ...(result.metadata?.exif === undefined
      ? {}
      : {
          exif: result.metadata.exif,
        }),
    ...(result.uri === undefined ? {} : { sourceUri: result.uri }),
  })

  return metadata === undefined ? { file } : { file, metadata }
}

async function buildSelectedPhotoMetadata(options: {
  capturedAt?: string | null
  exif?: string | Record<string, unknown> | undefined
  file: File
  latitude?: number
  longitude?: number
  sourceUri?: string
}): Promise<PhotoMetadataOverride | undefined> {
  const gpsFromPreloaded = getMeaningfulGpsCoordinates(
    options.latitude,
    options.longitude,
  )
  const gpsFromNative =
    gpsFromPreloaded ?? (await readNativePhotoGps(options.sourceUri))
  const gpsFromExif = parseNativeExifGps(options.exif)
  const gpsFromBlob = await readGpsFromFile(options.file)

  const latitude =
    gpsFromNative?.latitude ??
    (isMeaningfulGpsCoordinate(gpsFromExif.latitude, gpsFromExif.longitude)
      ? gpsFromExif.latitude
      : gpsFromBlob?.latitude)
  const longitude =
    gpsFromNative?.longitude ??
    (isMeaningfulGpsCoordinate(gpsFromExif.latitude, gpsFromExif.longitude)
      ? gpsFromExif.longitude
      : gpsFromBlob?.longitude)

  const capturedAt = options.capturedAt

  const gps = getMeaningfulGpsCoordinates(latitude, longitude)

  if (capturedAt === undefined && gps === null) {
    return undefined
  }

  return {
    ...(capturedAt === undefined ? {} : { capturedAt }),
    ...(gps ?? {}),
  }
}

async function readGpsFromFile(file: File) {
  const buffer = await file.arrayBuffer()
  const gps = await exifr.gps(buffer).catch(() => undefined)
  if (
    gps === undefined ||
    !isMeaningfulGpsCoordinate(gps.latitude, gps.longitude)
  ) {
    return undefined
  }

  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
  }
}

async function loadPickedFileBlob(picked: PickedFile): Promise<{
  blob: Blob
  metadata?: PhotoMetadataOverride
  mimeType?: string
}> {
  if (
    Capacitor.getPlatform() === 'android' &&
    picked.path?.startsWith('content:')
  ) {
    const materialized = await materializeNativePhoto(picked.path)

    const response = await fetch(materialized.webPath)

    if (!response.ok) {
      throw new Error(
        `Selected photo fetch failed (${String(response.status)})`,
      )
    }

    const blob = await response.blob()
    if (blob.size === 0) {
      throw new Error('Selected photo blob is empty')
    }

    return {
      blob,
      metadata: readMaterializedPhotoMetadata(materialized),
      mimeType: materialized.mimeType ?? picked.mimeType,
    }
  }

  const sources = [
    picked.path === undefined
      ? undefined
      : Capacitor.convertFileSrc(picked.path),
    picked.path,
  ].filter((source): source is string => source !== undefined && source !== '')

  for (const source of sources) {
    try {
      const response = await fetch(source)
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 0) {
          return {
            blob,
            mimeType:
              picked.mimeType === ''
                ? inferMimeTypeFromName(picked.name)
                : picked.mimeType,
          }
        }
      }
    } catch {
      // Try the next loading strategy.
    }
  }

  throw new Error('Selected photo could not be loaded from any source')
}

async function loadCapacitorMediaBlob(
  result: CapacitorGalleryResult,
): Promise<Blob> {
  const mimeType = inferMimeType(result.metadata?.format)
  const sources = [
    result.webPath,
    result.uri === undefined ? undefined : Capacitor.convertFileSrc(result.uri),
    result.uri,
  ].filter((source): source is string => source !== undefined && source !== '')

  for (const source of sources) {
    try {
      const response = await fetch(source)
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 0) {
          return blob
        }
      }
    } catch {
      // Try the next loading strategy.
    }
  }

  if (result.thumbnail !== undefined && result.thumbnail.length > 0) {
    return base64ToBlob(result.thumbnail, mimeType)
  }

  throw new Error('Selected photo could not be loaded')
}

function normalizeCapturedAtFromTimestamp(timestamp: number | undefined) {
  if (timestamp === undefined) {
    return undefined
  }

  const date = new Date(timestamp)
  return Number.isNaN(date.valueOf()) ? null : date.toISOString()
}

function deriveFileName(path: string, format: string | undefined) {
  try {
    const pathName = new URL(path, 'https://local.invalid').pathname
    const baseName = pathName.split('/').pop()
    if (baseName?.includes('.')) {
      return decodeURIComponent(baseName)
    }
  } catch {
    // Fall back to a generated name below.
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

function inferMimeTypeFromName(name: string) {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === undefined || extension === '') {
    return 'image/jpeg'
  }

  return extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
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
