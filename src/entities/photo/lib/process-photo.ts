import exifr from 'exifr'
import { calculateDimensions } from '@/entities/photo/lib/photo-dimensions'
import type { PhotoVariantKind } from '@/entities/photo/model/photo'

interface ProcessedVariant {
  blob: Blob
  height: number
  kind: PhotoVariantKind
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
  const metadata = await extractPhotoMetadata(file)
  const variants = await processVariants(file)
  const capturedAt =
    metadataOverrides?.capturedAt !== undefined
      ? metadataOverrides.capturedAt
      : (metadata?.DateTimeOriginal?.toISOString() ?? null)
  const latitude =
    metadataOverrides?.latitude !== undefined
      ? metadataOverrides.latitude
      : (metadata?.latitude ?? null)
  const longitude =
    metadataOverrides?.longitude !== undefined
      ? metadataOverrides.longitude
      : (metadata?.longitude ?? null)

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
      latitude: gpsMetadata.latitude,
      longitude: gpsMetadata.longitude,
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
    ...(fullMetadata?.latitude === undefined
      ? {}
      : { latitude: fullMetadata.latitude }),
    ...(fullMetadata?.longitude === undefined
      ? {}
      : { longitude: fullMetadata.longitude }),
  }
}

function processVariants(file: File): Promise<ProcessedVariant[]> {
  return processVariantsInWorker(file).catch(() => processVariantsOnPage(file))
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

async function processVariantsOnPage(file: File): Promise<ProcessedVariant[]> {
  const source = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  }).catch(() => createImageBitmap(file))
  const variants = [
    { kind: 'thumb', maxWidth: 400, quality: 0.72 },
    { kind: 'preview', maxWidth: 1000, quality: 0.78 },
    { kind: 'large', maxWidth: 1800, quality: 0.82 },
  ] as const

  try {
    return await Promise.all(
      variants.map(async (variant) => {
        const dimensions = calculateDimensions(source, variant.maxWidth)
        const canvas = document.createElement('canvas')
        canvas.width = dimensions.width
        canvas.height = dimensions.height
        const context = canvas.getContext('2d')
        if (context === null) {
          throw new Error('Image canvas is unavailable')
        }
        context.drawImage(source, 0, 0, dimensions.width, dimensions.height)
        return {
          blob: await canvasToBlob(canvas, variant.quality),
          ...dimensions,
          kind: variant.kind,
        }
      }),
    )
  } finally {
    source.close()
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error('Photo variant could not be encoded'))
          return
        }
        resolve(blob)
      },
      'image/webp',
      quality,
    )
  })
}
