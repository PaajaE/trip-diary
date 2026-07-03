import { describe, expect, it, vi } from 'vitest'
import {
  clearPhotoObjectUrlCache,
  getCachedPhotoObjectUrl,
  resolvePhotoObjectUrl,
} from '@/shared/lib/photo-object-url-cache'

describe('photo-object-url-cache', () => {
  it('reuses the same object url for the same photo id and blob', async () => {
    clearPhotoObjectUrlCache()
    const blob = new Blob(['photo'], { type: 'image/jpeg' })
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:cached-photo')

    const first = await resolvePhotoObjectUrl('photo-1', blob)
    const second = await resolvePhotoObjectUrl('photo-1', blob)

    expect(first).toBe('blob:cached-photo')
    expect(second).toBe('blob:cached-photo')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(getCachedPhotoObjectUrl('photo-1')).toBe('blob:cached-photo')

    createObjectURL.mockRestore()
    clearPhotoObjectUrlCache()
  })
})
