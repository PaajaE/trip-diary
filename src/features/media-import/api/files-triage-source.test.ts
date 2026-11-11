import { describe, expect, it, vi } from 'vitest'
import { createFilesTriageSource } from '@/features/media-import/api/files-triage-source'

describe('files triage source', () => {
  it('turns chosen files into candidates, previews and openable originals', async () => {
    const photo = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    const heic = new File(['x'], 'b.heic', { type: 'image/heic' })
    const source = createFilesTriageSource(() => Promise.resolve([photo, heic]))
    const picked = await source.pick()
    expect(picked?.candidates).toHaveLength(2)
    expect(
      picked?.candidates.find((c) => c.skipReason === 'heic_unsupported'),
    ).toBeTruthy()
    const id = picked?.candidates[0]?.sourceId ?? ''
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    const [thumb] = await source.thumbnails([id], 256)
    expect(thumb).toEqual({ cloud: false, id, src: 'blob:preview' })
    const opened = await source.mediaSource.open({
      capturedAt: null,
      durationMs: null,
      latitude: null,
      longitude: null,
      mediaType: 'photo',
      sourceId: id,
    })
    expect(opened.file).toBe(photo)
  })

  it('returns null when the dialog is cancelled and never fakes an iCloud tile', async () => {
    const source = createFilesTriageSource(() => Promise.resolve(null))
    expect(await source.pick()).toBeNull()
    expect(await source.thumbnails(['unknown'], 256)).toEqual([
      { cloud: false, id: 'unknown', src: null },
    ])
    expect(source.hasLibrary).toBe(false)
  })
})
