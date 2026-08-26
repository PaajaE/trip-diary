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
      terminate(): void {
        // Worker stub — nothing to clean up.
      }
    }
    vi.stubGlobal('Worker', FailingWorker)

    const bitmap = { width: 2000, height: 1000, close: vi.fn() }
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve(bitmap)),
    )

    const drawImage = vi.fn()
    const canvas: Partial<HTMLCanvasElement> = {
      width: 0,
      height: 0,
      getContext: (() =>
        ({
          drawImage,
        }) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement['getContext'],
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
      .mockImplementation((tagName: string) => {
        if (tagName === 'canvas') return canvas as HTMLCanvasElement
        throw new Error(`Unexpected createElement call: ${tagName}`)
      })

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {
      type: 'image/jpeg',
    })
    const result = await processPhoto(file)

    expect(result.variants.length).toBe(4)
    expect(result.variants.map((variant) => variant.kind).sort()).toEqual([
      'full',
      'medium',
      'small',
      'thumb',
    ])
    expect(result.variants.every((variant) => variant.ext === 'jpg')).toBe(true)
    expect(
      result.variants.every((variant) => variant.mimeType === 'image/jpeg'),
    ).toBe(true)

    createElementSpy.mockRestore()
  })
})
