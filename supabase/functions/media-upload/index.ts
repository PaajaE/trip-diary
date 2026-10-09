// Issues presigned URLs for direct uploads to Cloudflare R2.
//
// Photos: one presigned PUT per variant (Content-Type is part of the
// signature). Videos: S3 multipart upload; the client PUTs parts to
// presigned URLs (resumable, works from iOS background URLSession).
// Keys always live under the signed-in user's folder, so nobody can write
// into someone else's media.

import { AwsClient } from 'npm:aws4fetch@1.0.20'
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

import { handleOptions, jsonResponse } from '../_shared/http.ts'
import {
  completeMultipartXml,
  MULTIPART_PART_BYTES,
  objectKey,
  objectUrl,
  parseUploadIdXml,
  parseUploadRequest,
  partCount,
  PART_URL_TTL_SECONDS,
  publicUrl,
  PUT_URL_TTL_SECONDS,
  r2Endpoint,
} from '../_shared/media/upload.ts'

function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name) ?? fallback
  if (value === undefined || value === '') {
    throw new Error(`${name} is not configured`)
  }
  return value
}

async function presign(
  client: AwsClient,
  url: string,
  ttlSeconds: number,
  headers: Record<string, string> = {},
): Promise<string> {
  const target = new URL(url)
  target.searchParams.set('X-Amz-Expires', String(ttlSeconds))
  const signed = await client.sign(
    new Request(target, { headers, method: 'PUT' }),
    { aws: { signQuery: true } },
  )
  return signed.url
}

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options !== null) {
    return options
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }
  const authHeader = request.headers.get('Authorization')
  if (authHeader === null || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  try {
    const { data, error } = await createClient(
      env('SUPABASE_URL'),
      env('SUPABASE_ANON_KEY'),
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } },
      },
    ).auth.getUser()
    if (error !== null) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }
    const userId = data.user.id

    const parsed = parseUploadRequest(await request.json().catch(() => null))
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400)
    }
    const body = parsed.value

    const client = new AwsClient({
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      region: 'auto',
      secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
      service: 's3',
    })
    const endpoint = r2Endpoint(env('R2_ACCOUNT_ID'))
    const bucket = env('R2_BUCKET')
    const publicBase = env(
      'R2_PUBLIC_BASE_URL',
      'https://media.cestovni-denik.cz',
    )

    switch (body.action) {
      case 'sign-put': {
        const key = objectKey(userId, body.mediaId, body.kind, body.contentType)
        const url = await presign(
          client,
          objectUrl(endpoint, bucket, key),
          PUT_URL_TTL_SECONDS,
          { 'Content-Type': body.contentType },
        )
        return jsonResponse({
          headers: { 'Content-Type': body.contentType },
          key,
          publicUrl: publicUrl(publicBase, key),
          url,
        })
      }
      case 'multipart-create': {
        const key = objectKey(userId, body.mediaId, 'video', 'video/mp4')
        const response = await client.fetch(
          `${objectUrl(endpoint, bucket, key)}?uploads`,
          { headers: { 'Content-Type': 'video/mp4' }, method: 'POST' },
        )
        const uploadId = parseUploadIdXml(await response.text())
        if (!response.ok || uploadId === null) {
          throw new Error(`create multipart ${String(response.status)}`)
        }
        return jsonResponse({
          key,
          partBytes: MULTIPART_PART_BYTES,
          partCount: partCount(body.byteSize),
          publicUrl: publicUrl(publicBase, key),
          uploadId,
        })
      }
      case 'multipart-sign-parts': {
        const key = objectKey(userId, body.mediaId, 'video', 'video/mp4')
        const base = objectUrl(endpoint, bucket, key)
        const parts = await Promise.all(
          body.partNumbers.map(async (partNumber) => {
            const target = new URL(base)
            target.searchParams.set('partNumber', String(partNumber))
            target.searchParams.set('uploadId', body.uploadId)
            return {
              partNumber,
              url: await presign(
                client,
                target.toString(),
                PART_URL_TTL_SECONDS,
              ),
            }
          }),
        )
        return jsonResponse({ key, parts })
      }
      case 'multipart-complete': {
        const key = objectKey(userId, body.mediaId, 'video', 'video/mp4')
        const target = new URL(objectUrl(endpoint, bucket, key))
        target.searchParams.set('uploadId', body.uploadId)
        const response = await client.fetch(target.toString(), {
          body: completeMultipartXml(body.parts),
          headers: { 'Content-Type': 'application/xml' },
          method: 'POST',
        })
        const text = await response.text()
        if (!response.ok || text.includes('<Error>')) {
          return jsonResponse({ error: 'complete_failed' }, 409)
        }
        return jsonResponse({ key, publicUrl: publicUrl(publicBase, key) })
      }
      case 'multipart-abort': {
        const key = objectKey(userId, body.mediaId, 'video', 'video/mp4')
        const target = new URL(objectUrl(endpoint, bucket, key))
        target.searchParams.set('uploadId', body.uploadId)
        const response = await client.fetch(target.toString(), {
          method: 'DELETE',
        })
        return jsonResponse({ aborted: response.ok || response.status === 404 })
      }
    }
  } catch (error) {
    console.error('media-upload failed', error)
    return jsonResponse({ error: 'upload_signing_failed' }, 502)
  }
})
