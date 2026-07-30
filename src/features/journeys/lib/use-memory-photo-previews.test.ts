import { describe, expect, it, vi } from 'vitest'

const capacitorState = vi.hoisted(() => ({
  isNative: true,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capacitorState.isNative,
  },
}))

vi.mock('@/shared/lib/preview-url', async () => {
  const actual = await vi.importActual('@/shared/lib/preview-url')
  return {
    ...actual,
    createPreviewUrl: vi.fn((blob: Blob) =>
      Promise.resolve(`data:${blob.type || 'image/jpeg'};base64,`),
    ),
  }
})

import type { ProcessedPhoto } from '@/entities/photo/lib/process-photo'
import { renderHook, waitFor } from '@testing-library/react'
import { useMemoryPhotoPreviews } from '@/features/journeys/lib/use-memory-photo-previews'

function createProcessedPhoto(): ProcessedPhoto {
  return {
    capturedAt: '2026-06-19T20:53:19.000-06:00',
    latitude: 52.66,
    longitude: -117.88,
    variants: [
      {
        blob: new Blob(['thumb'], { type: 'image/jpeg' }),
        ext: 'jpg',
        height: 400,
        kind: 'thumb',
        mimeType: 'image/jpeg',
        width: 400,
      },
    ],
  }
}

describe('useMemoryPhotoPreviews', () => {
  it('waits for processed variants on native instead of using originals', async () => {
    capacitorState.isNative = true
    const file = new File(['original'], 'photo.jpg', { type: 'image/jpeg' })

    const { result, rerender, unmount } = renderHook(
      ({ detectedPhotos }) =>
        useMemoryPhotoPreviews([{ file }], detectedPhotos),
      {
        initialProps: {
          detectedPhotos: [] as ProcessedPhoto[],
        },
      },
    )

    expect(result.current).toEqual([])

    rerender({ detectedPhotos: [createProcessedPhoto()] })

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
    })
    expect(result.current[0]?.url).toMatch(/^data:image\/jpeg;base64,/)

    // Flush async preview work before jsdom teardown — otherwise React's
    // scheduler can throw "window is not defined" as an unhandled error.
    unmount()
    await Promise.resolve()
  })
})
