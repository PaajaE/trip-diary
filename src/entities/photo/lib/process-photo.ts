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
  DateTimeOriginal?: Date
  latitude?: number
  longitude?: number
}

export interface ProcessedPhoto {
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
  variants: ProcessedVariant[]
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const metadata = (await exifr.parse(file, [
    'DateTimeOriginal',
    'latitude',
    'longitude',
  ])) as ExifMetadata | undefined
  const variants = await processVariants(file)

  return {
    capturedAt: metadata?.DateTimeOriginal?.toISOString() ?? null,
    latitude: metadata?.latitude ?? null,
    longitude: metadata?.longitude ?? null,
    variants,
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
