import exifr from 'exifr'
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

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const metadata = await extractPhotoMetadata(file)
  const variants = await processVariants(file)

  return {
    capturedAt: metadata?.DateTimeOriginal?.toISOString() ?? null,
    latitude: metadata?.latitude ?? null,
    longitude: metadata?.longitude ?? null,
    variants,
  }
}

async function extractPhotoMetadata(
  file: File,
): Promise<ExifMetadata | undefined> {
  const buffer = await file.arrayBuffer()
  const basicMetadata = (await exifr.parse(buffer, ['DateTimeOriginal'])) as
    | ExifMetadata
    | undefined
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
