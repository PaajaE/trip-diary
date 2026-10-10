import { describe, expect, it } from 'vitest'
import {
  createWebFilesSource,
  webSourceId,
} from '@/features/media-import/api/web-files-source'

function file(name: string, type: string, size = 3, lastModified = 1000) {
  return new File([new Uint8Array(size)], name, { lastModified, type })
}

describe('web files source', () => {
  it('lists photos, rejects HEIC clearly and skips web videos', async () => {
    const jpg = file('a.jpg', 'image/jpeg')
    const source = createWebFilesSource([
      jpg,
      file('b.png', 'image/png'),
      file('c.heic', 'image/heic'),
      file('d.HEIF', ''),
      file('e.mp4', 'video/mp4'),
      file('f.gif', 'image/gif'),
    ])
    const list = await source.list()
    expect(source.kind).toBe('web-files')
    expect(
      list.map((c) => [c.sourceId.split('|')[0], c.mediaType, c.skipReason]),
    ).toEqual([
      ['a.jpg', 'photo', undefined],
      ['b.png', 'photo', undefined],
      ['c.heic', 'photo', 'heic_unsupported'],
      ['d.HEIF', 'photo', 'heic_unsupported'],
      ['e.mp4', 'video', 'web_video_unsupported'],
      ['f.gif', 'photo', 'unsupported_type'],
    ])
    expect(list[0]).toMatchObject({ byteSize: 3, capturedAt: null })
  })

  it('uses a stable id from name, size and lastModified', () => {
    expect(webSourceId(file('a.jpg', 'image/jpeg', 5, 42))).toBe('a.jpg|5|42')
    expect(webSourceId(file('a.jpg', 'image/jpeg', 5, 43))).not.toBe(
      'a.jpg|5|42',
    )
  })

  it('opens the picked file and rejects unknown ids', async () => {
    const jpg = file('a.jpg', 'image/jpeg')
    const source = createWebFilesSource([jpg])
    const [candidate] = await source.list()
    if (candidate === undefined) throw new Error('no candidate')
    const opened = await source.open(candidate)
    expect(opened.file).toBe(jpg)
    await expect(opened.cleanup()).resolves.toBeUndefined()
    await expect(
      source.open({ ...candidate, sourceId: 'zzz' }),
    ).rejects.toThrow('source_unavailable')
  })
})
