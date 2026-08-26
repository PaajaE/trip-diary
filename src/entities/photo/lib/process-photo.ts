import exifr from 'exifr'
import { Capacitor } from '@capacitor/core'
import { isHeicLikeImageInput } from '@trip-diary/utils'
import {
  getMeaningfulGpsCoordinates,
  isMeaningfulGpsCoordinate,
} from '@/entities/photo/lib/photo-exif-gps'
import {
  calculateDimensions,
  calculateNormalizedFullDimensions,
} from '@/entities/photo/lib/photo-dimensions'
import {
  LOCAL_PHOTO_VARIANT_SIZES,
  type PhotoVariantSizeConfig,
} from '@/entities/photo/lib/photo-variant-config'
import type { PhotoVariantKind } from '@/entities/photo/model/photo'

interface ProcessedVariant {
  blob: Blob
  ext: 'jpg' | 'webp' | 'mp4'
  height: number
  kind: PhotoVariantKind
  mimeType: 'image/jpeg' | 'image/webp' | 'video/mp4'
  width: number
}

interface WorkerResponse {
  error?: string
  requestId: string
  results?: ProcessedVariant[]
}

interface ExifMetadata {
  DateTimeOriginal?: Date | undefined
  latitude?: number | undefined
  longitude?: number | undefined
}

export interface ProcessedPhoto {
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
  variants: ProcessedVariant[]
}

export interface PhotoMetadataOverride {
  capturedAt?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface SelectedPhotoFile {
  file: File
  metadata?: PhotoMetadataOverride
}

export async function processPhoto(
  input: File | SelectedPhotoFile,
): Promise<ProcessedPhoto> {
  const file = input instanceof File ? input : input.file
  const metadataOverrides = input instanceof File ? undefined : input.metadata

  if (
    isHeicLikeImageInput({
      mimeType: file.type,
      nameOrUri: file.name,
    })
  ) {
    throw new Error('HEIC_UNSUPPORTED')
  }

  const metadata = await extractPhotoMetadata(file)
  const variants = await processVariants(file)

  const capturedAt =
    metadataOverrides?.capturedAt !== undefined
      ? metadataOverrides.capturedAt
      : (metadata?.DateTimeOriginal?.toISOString() ?? null)
  const metadataGps = getMeaningfulGpsCoordinates(
    metadata?.latitude,
    metadata?.longitude,
  )
  const latitude =
    metadataOverrides?.latitude !== undefined
      ? metadataOverrides.latitude
      : (metadataGps?.latitude ?? null)
  const longitude =
    metadataOverrides?.longitude !== undefined
      ? metadataOverrides.longitude
      : (metadataGps?.longitude ?? null)

  return {
    capturedAt,
    latitude,
    longitude,
    variants,
  }
}

async function extractPhotoMetadata(
  file: File,
): Promise<ExifMetadata | undefined> {
  const buffer = await file.arrayBuffer()
  const basicMetadata = (await exifr
    .parse(buffer, ['DateTimeOriginal'])
    .catch(() => undefined)) as ExifMetadata | undefined
  const gpsMetadata = await exifr.gps(buffer).catch(() => undefined)

  if (gpsMetadata !== undefined) {
    return {
      ...(basicMetadata?.DateTimeOriginal === undefined
        ? {}
        : { DateTimeOriginal: basicMetadata.DateTimeOriginal }),
      ...(isMeaningfulGpsCoordinate(gpsMetadata.latitude, gpsMetadata.longitude)
        ? {
            latitude: gpsMetadata.latitude,
            longitude: gpsMetadata.longitude,
          }
        : {}),
    }
  }

  const fullMetadata = (await exifr
    .parse(buffer, true)
    .catch(() => undefined)) as ExifMetadata | undefined

  return {
    ...((basicMetadata?.DateTimeOriginal ?? fullMetadata?.DateTimeOriginal) ===
    undefined
      ? {}
      : {
          DateTimeOriginal:
            basicMetadata?.DateTimeOriginal ?? fullMetadata?.DateTimeOriginal,
        }),
    ...(isMeaningfulGpsCoordinate(
      fullMetadata?.latitude,
      fullMetadata?.longitude,
    )
      ? {
          latitude: fullMetadata.latitude,
          longitude: fullMetadata.longitude,
        }
      : {}),
  }
}

function processVariants(file: File): Promise<ProcessedVariant[]> {
  if (Capacitor.isNativePlatform()) {
    return processVariantsOnPage(file)
  }

  try {
    return processVariantsInWorker(file).catch(() =>
      processVariantsOnPage(file),
    )
  } catch {
    return processVariantsOnPage(file)
  }
}

function processVariantsInWorker(file: File): Promise<ProcessedVariant[]> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const worker = new Worker(new URL('./photo.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.requestId !== requestId) {
        return
      }
      worker.terminate()
      if (event.data.error !== undefined || event.data.results === undefined) {
        reject(new Error(event.data.error ?? 'Photo processing failed'))
        return
      }
      resolve(event.data.results)
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('Photo processing worker failed'))
    }
    worker.postMessage({ file, requestId })
  })
}

function resolveVariantOutputSize(
  source: { height: number; width: number },
  variant: PhotoVariantSizeConfig,
): { height: number; width: number } {
  if (variant.useNormalizedFull) {
    return calculateNormalizedFullDimensions(source)
  }
  return calculateDimensions(source, variant.maxLongestEdge)
}

async function processVariantsOnPage(file: File): Promise<ProcessedVariant[]> {
  const source = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  }).catch(() => createImageBitmap(file))
  const variants = LOCAL_PHOTO_VARIANT_SIZES

  try {
    return await Promise.all(
      variants.map(async (variant) => {
        const dimensions = resolveVariantOutputSize(source, variant)
        const canvas = document.createElement('canvas')
        canvas.width = dimensions.width
        canvas.height = dimensions.height
        const context = canvas.getContext('2d')
        if (context === null) {
          throw new Error('Image canvas is unavailable')
        }
        context.drawImage(source, 0, 0, dimensions.width, dimensions.height)
        const encoded = await canvasToEncodedBlob(canvas, variant.quality)
        return {
          blob: encoded.blob,
          ...dimensions,
          ext: encoded.ext,
          kind: variant.kind,
          mimeType: encoded.mimeType,
        }
      }),
    )
  } finally {
    source.close()
  }
}

async function canvasToEncodedBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<{
  blob: Blob
  ext: 'jpg' | 'webp'
  mimeType: 'image/jpeg' | 'image/webp'
}> {
  // iOS/WKWebView commonly can't encode WebP via canvas. Prefer WebP, but
  // fall back to JPEG so saving moments on mobile doesn't fail.
  const webp = await canvasToBlob(canvas, 'image/webp', quality).catch(
    () => null,
  )
  if (webp !== null) {
    return { blob: webp, ext: 'webp', mimeType: 'image/webp' }
  }

  const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality).catch(
    () => null,
  )
  if (jpeg !== null) {
    return { blob: jpeg, ext: 'jpg', mimeType: 'image/jpeg' }
  }

  throw new Error('Photo variant could not be encoded')
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/jpeg' | 'image/webp',
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error(`Canvas failed to encode ${mimeType}`))
          return
        }
        resolve(blob)
      },
      mimeType,
      quality,
    )
  })
}
