import { describe, expect, it } from 'vitest'
import {
  completeMultipartXml,
  DeleteMediaError,
  deleteMediaObjects,
  IMAGE_MAX_BYTES,
  mediaPrefix,
  MULTIPART_PART_BYTES,
  objectKey,
  objectUrl,
  type ObjectStore,
  parseListPage,
  parseUploadIdXml,
  parseUploadRequest,
  partCount,
  publicUrl,
  r2Endpoint,
  VIDEO_DURATION_TOLERANCE_MS,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
} from './media-upload.ts'

const USER = '2f84d109-3eaf-404a-9e1a-496c1d89e4a4'
const MEDIA = 'A3000000-0000-4000-8000-000000000001'

describe('parseUploadRequest', () => {
  it('accepts a photo variant upload and normalises the media id', () => {
    expect(
      parseUploadRequest({
        action: 'sign-put',
        byteSize: 120_000,
        contentType: 'image/webp',
        kind: 'small',
        mediaId: MEDIA,
      }),
    ).toEqual({
      ok: true,
      value: {
        action: 'sign-put',
        byteSize: 120_000,
        contentType: 'image/webp',
        kind: 'small',
        mediaId: MEDIA.toLowerCase(),
      },
    })
  })

  it.each([
    [
      {
        action: 'sign-put',
        byteSize: 1,
        contentType: 'image/png',
        kind: 'small',
        mediaId: MEDIA,
      },
      'invalid_content_type',
    ],
    [
      {
        action: 'sign-put',
        byteSize: 1,
        contentType: 'image/webp',
        kind: 'video',
        mediaId: MEDIA,
      },
      'invalid_kind',
    ],
    [
      {
        action: 'sign-put',
        byteSize: IMAGE_MAX_BYTES + 1,
        contentType: 'image/webp',
        kind: 'large',
        mediaId: MEDIA,
      },
      'invalid_size',
    ],
    [
      {
        action: 'multipart-create',
        byteSize: VIDEO_MAX_BYTES + 1,
        mediaId: MEDIA,
      },
      'invalid_size',
    ],
    [
      { action: 'multipart-create', byteSize: 1000, mediaId: MEDIA },
      'invalid_duration',
    ],
    [
      {
        action: 'multipart-create',
        byteSize: 1000,
        durationMs: 0,
        mediaId: MEDIA,
      },
      'invalid_duration',
    ],
    [
      {
        action: 'multipart-create',
        byteSize: 1000,
        durationMs: 1.5,
        mediaId: MEDIA,
      },
      'invalid_duration',
    ],
    [
      {
        action: 'multipart-create',
        byteSize: 1000,
        durationMs: '5000',
        mediaId: MEDIA,
      },
      'invalid_duration',
    ],
    [
      {
        action: 'multipart-create',
        byteSize: 1000,
        durationMs: VIDEO_MAX_DURATION_MS + VIDEO_DURATION_TOLERANCE_MS + 1,
        mediaId: MEDIA,
      },
      'video_too_long',
    ],
    [{ action: 'sign-put', mediaId: '../etc/passwd' }, 'invalid_media_id'],
    [
      {
        action: 'multipart-sign-parts',
        mediaId: MEDIA,
        partNumbers: [0],
        uploadId: 'abc',
      },
      'invalid_parts',
    ],
    [
      {
        action: 'multipart-sign-parts',
        mediaId: MEDIA,
        partNumbers: [1],
        uploadId: 'a b',
      },
      'invalid_upload_id',
    ],
    [
      {
        action: 'multipart-complete',
        mediaId: MEDIA,
        parts: [{ partNumber: 1, etag: '<x>' }],
        uploadId: 'abc',
      },
      'invalid_parts',
    ],
    [{ action: 'delete-everything', mediaId: MEDIA }, 'invalid_action'],
    [null, 'invalid_body'],
  ])('rejects %j', (body, error) => {
    expect(parseUploadRequest(body)).toEqual({ error, ok: false })
  })

  it('dedupes and sorts part numbers', () => {
    const parsed = parseUploadRequest({
      action: 'multipart-sign-parts',
      mediaId: MEDIA,
      partNumbers: [3, 1, 3, 2],
      uploadId: 'upload-123',
    })

    expect(
      parsed.ok && parsed.value.action === 'multipart-sign-parts'
        ? parsed.value.partNumbers
        : null,
    ).toEqual([1, 2, 3])
  })
})

describe('object keys', () => {
  it('writes under the user folder with a typed extension', () => {
    expect(objectKey(USER, MEDIA, 'small', 'image/webp')).toBe(
      `${USER}/${MEDIA.toLowerCase()}/small.webp`,
    )
    expect(objectKey(USER, MEDIA, 'video', 'video/mp4')).toBe(
      `${USER}/${MEDIA.toLowerCase()}/video.mp4`,
    )
  })

  it('refuses mismatched kind and content type', () => {
    expect(() => objectKey(USER, MEDIA, 'video', 'image/jpeg')).toThrow()
    expect(() => objectKey(USER, MEDIA, 'large', 'video/mp4')).toThrow()
  })

  it('refuses ids that are not UUIDs', () => {
    expect(() => objectKey('..', MEDIA, 'small', 'image/webp')).toThrow()
  })
})

describe('R2 helpers', () => {
  const endpoint = r2Endpoint('0123456789abcdef0123456789ABCDEF')

  it('builds the account endpoint and object URL', () => {
    expect(endpoint).toBe(
      'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
    )
    expect(objectUrl(endpoint, 'trip-diary-media', 'a/b/c.jpg')).toBe(
      `${endpoint}/trip-diary-media/a/b/c.jpg`,
    )
  })

  it('rejects a malformed account id', () => {
    expect(() => r2Endpoint('not-an-account')).toThrow()
  })

  it('builds the public URL on the custom domain', () => {
    expect(
      publicUrl('https://media.cestovni-denik.cz/', 'a/b/small.webp'),
    ).toBe('https://media.cestovni-denik.cz/a/b/small.webp')
  })

  it('plans parts of at least 5 MiB', () => {
    expect(MULTIPART_PART_BYTES).toBeGreaterThanOrEqual(5 * 1024 * 1024)
    expect(partCount(1)).toBe(1)
    expect(partCount(30 * 1024 * 1024)).toBe(4)
  })

  it('reads the upload id and builds the completion body', () => {
    expect(
      parseUploadIdXml(
        '<InitiateMultipartUploadResult><UploadId>abc-123</UploadId></InitiateMultipartUploadResult>',
      ),
    ).toBe('abc-123')
    expect(
      completeMultipartXml([
        { etag: 'e1', partNumber: 1 },
        { etag: '"e2"', partNumber: 2 },
      ]),
    ).toBe(
      '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"e1"</ETag></Part><Part><PartNumber>2</PartNumber><ETag>"e2"</ETag></Part></CompleteMultipartUpload>',
    )
  })
})

describe('media deletion', () => {
  it('accepts a delete request for one media item', () => {
    expect(
      parseUploadRequest({ action: 'delete-media', mediaId: MEDIA }),
    ).toEqual({
      ok: true,
      value: { action: 'delete-media', mediaId: MEDIA.toLowerCase() },
    })
  })

  it('scopes deletion to the user folder of that media', () => {
    expect(mediaPrefix(USER, MEDIA)).toBe(`${USER}/${MEDIA.toLowerCase()}/`)
    expect(() => mediaPrefix(USER, '*')).toThrow()
  })

  it('rejects a delete request without a valid media id', () => {
    expect(parseUploadRequest({ action: 'delete-media' })).toEqual({
      error: 'invalid_media_id',
      ok: false,
    })
    expect(
      parseUploadRequest({ action: 'delete-media', mediaId: '../x' }),
    ).toEqual({ error: 'invalid_media_id', ok: false })
  })

  it('refuses a prefix built from a non-UUID user id', () => {
    expect(() => mediaPrefix('not-a-uuid', MEDIA)).toThrow()
  })

  it('reads keys and the continuation token from a list page', () => {
    expect(
      parseListPage(
        '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>u/m/small.webp</Key></Contents><Contents><Key>u/m/a&amp;b.mp4</Key></Contents><NextContinuationToken>tok1</NextContinuationToken></ListBucketResult>',
      ),
    ).toEqual({ keys: ['u/m/small.webp', 'u/m/a&b.mp4'], nextToken: 'tok1' })
    expect(
      parseListPage(
        '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
      ),
    ).toEqual({ keys: [], nextToken: null })
  })
})

describe('deleteMediaObjects', () => {
  const ENDPOINT = 'https://acc.r2.cloudflarestorage.com'
  const PREFIX = mediaPrefix(USER, MEDIA)

  function listXml(keys: string[], next?: string): string {
    const items = keys.map((key) => `<Contents><Key>${key}</Key></Contents>`)
    const tail =
      next === undefined
        ? '<IsTruncated>false</IsTruncated>'
        : `<IsTruncated>true</IsTruncated><NextContinuationToken>${next}</NextContinuationToken>`
    return `<ListBucketResult>${items.join('')}${tail}</ListBucketResult>`
  }

  function fakeStore(options: {
    deleteStatus?: (key: string) => number
    pages: (Response | string)[]
  }): { calls: string[]; store: ObjectStore } {
    const calls: string[] = []
    const pages = [...options.pages]
    const store: ObjectStore = {
      fetch: (url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        if (init?.method === 'DELETE') {
          const key = decodeURIComponent(new URL(url).pathname).split(
            '/bucket/',
          )[1]
          return Promise.resolve(
            new Response(null, {
              status: options.deleteStatus?.(key ?? '') ?? 204,
            }),
          )
        }
        const page = pages.shift()
        return Promise.resolve(
          page instanceof Response ? page : new Response(page ?? listXml([])),
        )
      },
    }
    return { calls, store }
  }

  const KEY_A = `${PREFIX}small.webp`
  const KEY_B = `${PREFIX}large.webp`

  it('follows continuation tokens and deletes every page', async () => {
    const { calls, store } = fakeStore({
      pages: [listXml([KEY_A], 'next-1'), listXml([KEY_B])],
    })
    await expect(
      deleteMediaObjects(store, ENDPOINT, 'bucket', PREFIX),
    ).resolves.toBe(2)
    const lists = calls.filter((call) => call.startsWith('GET'))
    expect(lists).toHaveLength(2)
    expect(lists[1]).toContain('continuation-token=next-1')
    expect(calls.filter((call) => call.startsWith('DELETE'))).toHaveLength(2)
  })

  it('never deletes keys outside the media folder', async () => {
    const { calls, store } = fakeStore({
      pages: [listXml([KEY_A, `${USER}/other/small.webp`])],
    })
    await expect(
      deleteMediaObjects(store, ENDPOINT, 'bucket', PREFIX),
    ).resolves.toBe(1)
    expect(calls.filter((call) => call.startsWith('DELETE'))).toHaveLength(1)
  })

  it('succeeds with zero deletions for an empty folder (repeat delete)', async () => {
    const { store } = fakeStore({ pages: [listXml([])] })
    await expect(
      deleteMediaObjects(store, ENDPOINT, 'bucket', PREFIX),
    ).resolves.toBe(0)
  })

  it('treats a 404 on delete as already deleted, not as removed', async () => {
    const { store } = fakeStore({
      deleteStatus: (key) => (key === KEY_B ? 404 : 204),
      pages: [listXml([KEY_A, KEY_B])],
    })
    await expect(
      deleteMediaObjects(store, ENDPOINT, 'bucket', PREFIX),
    ).resolves.toBe(1)
  })

  it('fails when the listing fails', async () => {
    const { calls, store } = fakeStore({
      pages: [new Response('boom', { status: 500 })],
    })
    await expect(
      deleteMediaObjects(store, ENDPOINT, 'bucket', PREFIX),
    ).rejects.toBeInstanceOf(DeleteMediaError)
    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false)
  })

  it('fails instead of reporting success when a delete fails', async () => {
    const { store } = fakeStore({
      deleteStatus: (key) => (key === KEY_B ? 500 : 204),
      pages: [listXml([KEY_A, KEY_B])],
    })
    await expect(
      deleteMediaObjects(store, ENDPOINT, 'bucket', PREFIX),
    ).rejects.toBeInstanceOf(DeleteMediaError)
  })

  it('fails when the listing never ends', async () => {
    const { store } = fakeStore({
      pages: Array.from({ length: 20 }, () => listXml([KEY_A], 'again')),
    })
    await expect(
      deleteMediaObjects(store, ENDPOINT, 'bucket', PREFIX),
    ).rejects.toBeInstanceOf(DeleteMediaError)
  })
})

describe('video duration limit', () => {
  it('accepts a 60 s video and the rounding tolerance, rejects beyond it', () => {
    for (const durationMs of [
      1,
      VIDEO_MAX_DURATION_MS,
      VIDEO_MAX_DURATION_MS + VIDEO_DURATION_TOLERANCE_MS,
    ]) {
      expect(
        parseUploadRequest({
          action: 'multipart-create',
          byteSize: 5_000_000,
          durationMs,
          mediaId: MEDIA,
        }),
      ).toEqual({
        ok: true,
        value: {
          action: 'multipart-create',
          byteSize: 5_000_000,
          durationMs,
          mediaId: MEDIA.toLowerCase(),
        },
      })
    }
    expect(VIDEO_MAX_DURATION_MS).toBe(60_000)
  })
})
