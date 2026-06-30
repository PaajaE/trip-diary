import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const capacitorState = vi.hoisted(() => ({
  isNative: false,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capacitorState.isNative,
  },
}))

import {
  createPreviewUrl,
  revokePreviewUrl,
  shouldWaitForProcessedVariantsOnNative,
} from '@/shared/lib/preview-url'

describe('preview-url', () => {
  beforeEach(() => {
    capacitorState.isNative = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses blob URLs on web', async () => {
    const blob = new Blob(['hello'], { type: 'image/jpeg' })
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:web-preview')

    await expect(createPreviewUrl(blob)).resolves.toBe('blob:web-preview')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
  })

  it('uses data URLs for small blobs on native', async () => {
    capacitorState.isNative = true
    const blob = new Blob(['thumb'], { type: 'image/jpeg' })

    await expect(createPreviewUrl(blob)).resolves.toMatch(
      /^data:image\/jpeg;base64,/,
    )
  })

  it('rejects oversized blobs on native', async () => {
    capacitorState.isNative = true
    const blob = new Blob([new Uint8Array(2_000_000)], { type: 'image/jpeg' })

    await expect(createPreviewUrl(blob)).rejects.toThrow(/too large/)
  })

  it('falls back to blob URLs when data URL conversion fails on native', async () => {
    capacitorState.isNative = true
    const blob = new Blob(['thumb'], { type: 'image/jpeg' })
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(
      function readAsDataURL(this: FileReader) {
        this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>)
      },
    )
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:native-fallback')

    await expect(createPreviewUrl(blob)).resolves.toBe('blob:native-fallback')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
  })

  it('only revokes blob URLs', () => {
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(vi.fn())

    revokePreviewUrl('blob:test')
    revokePreviewUrl('data:image/jpeg;base64,abc')

    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('waits for processed variants on native only', () => {
    capacitorState.isNative = false
    expect(shouldWaitForProcessedVariantsOnNative()).toBe(false)

    capacitorState.isNative = true
    expect(shouldWaitForProcessedVariantsOnNative()).toBe(true)
  })
})
