import { calculateDimensions } from '@/entities/photo/lib/photo-dimensions'
import type { PhotoVariantKind } from '@/entities/photo/model/photo'

interface ProcessPhotoMessage {
  file: File
  requestId: string
}

const variants = [
  { kind: 'thumb', maxWidth: 400, quality: 0.72 },
  { kind: 'preview', maxWidth: 1000, quality: 0.78 },
  { kind: 'large', maxWidth: 1800, quality: 0.82 },
] as const

async function encodeVariant(
  canvas: OffscreenCanvas,
  quality: number,
): Promise<{ blob: Blob; ext: 'jpg' | 'webp'; mimeType: 'image/jpeg' | 'image/webp' }> {
  try {
    const blob = await canvas.convertToBlob({ quality, type: 'image/webp' })
    return { blob, ext: 'webp', mimeType: 'image/webp' }
  } catch {
    const blob = await canvas.convertToBlob({ quality, type: 'image/jpeg' })
    return { blob, ext: 'jpg', mimeType: 'image/jpeg' }
  }
}

self.onmessage = async (event: MessageEvent<ProcessPhotoMessage>) => {
  const { file, requestId } = event.data

  try {
    const source = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    }).catch(() => createImageBitmap(file))
    const results: {
      blob: Blob
      ext: 'jpg' | 'webp'
      height: number
      kind: PhotoVariantKind
      mimeType: 'image/jpeg' | 'image/webp'
      width: number
    }[] = []

    for (const variant of variants) {
      const dimensions = calculateDimensions(source, variant.maxWidth)
      const canvas = new OffscreenCanvas(dimensions.width, dimensions.height)
      const context = canvas.getContext('2d')
      if (context === null) {
        throw new Error('Image canvas is unavailable')
      }
      context.drawImage(source, 0, 0, dimensions.width, dimensions.height)
      const encoded = await encodeVariant(canvas, variant.quality)
      results.push({
        blob: encoded.blob,
        ...dimensions,
        ext: encoded.ext,
        kind: variant.kind,
        mimeType: encoded.mimeType,
      })
    }

    source.close()
    self.postMessage({ requestId, results })
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Photo processing failed',
      requestId,
    })
  }
}
