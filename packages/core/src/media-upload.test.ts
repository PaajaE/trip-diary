import { describe, expect, it } from 'vitest'
import {
  completeMultipartXml,
  IMAGE_MAX_BYTES,
  MULTIPART_PART_BYTES,
  objectKey,
  objectUrl,
  parseUploadIdXml,
  parseUploadRequest,
  partCount,
  publicUrl,
  r2Endpoint,
  VIDEO_MAX_BYTES,
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
