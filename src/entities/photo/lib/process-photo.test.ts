import { describe, expect, it, vi } from 'vitest'
import { processPhoto } from '@/entities/photo/lib/process-photo'

describe('processPhoto', () => {
  it('falls back to jpeg when webp encoding fails', async () => {
    // Worker path should fail so we exercise the on-page encoder.
    // Provide a minimal Worker stub that rejects via onerror.
    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      postMessage() {
        queueMicrotask(() => this.onerror?.(new Event('error')))
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FailingWorker as unknown as typeof Worker)

    const bitmap = { width: 2000, height: 1000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap) as unknown as typeof createImageBitmap)

    const drawImage = vi.fn()
    const canvas: Partial<HTMLCanvasElement> = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }) as unknown as CanvasRenderingContext2D,
      toBlob: (cb: BlobCallback, type?: string) => {
        if (type === 'image/webp') {
          cb(null)
          return
        }
        cb(new Blob(['x'], { type: type ?? 'image/jpeg' }))
      },
    }

    const createElementSpy = vi
      .spyOn(document, 'createElement')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((tagName: any) => {
        if (tagName === 'canvas') return canvas as HTMLCanvasElement
        return document.createElement(tagName)
      }) as typeof document.createElement)

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {
      type: 'image/jpeg',
    })
    const result = await processPhoto(file)

    expect(result.variants.length).toBeGreaterThan(0)
    expect(result.variants.every((variant) => variant.ext === 'jpg')).toBe(true)
    expect(result.variants.every((variant) => variant.mimeType === 'image/jpeg')).toBe(true)

    createElementSpy.mockRestore()
  })
})

