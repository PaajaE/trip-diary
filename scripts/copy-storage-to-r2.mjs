/**
 * Copies v1 photo files from Supabase Storage (bucket `photos`) to Cloudflare R2
 * under the SAME keys (docs/plan-v2.md, chapter 4: v2_migrate_from_v1 keeps
 * storage keys). Required before switching production to v2.
 *
 * Safe by design:
 *   - dry run by default; nothing is written unless --apply is passed
 *   - never deletes anything (neither in Storage nor in R2)
 *   - idempotent: objects already in R2 with the expected size are skipped
 *   - every copied object is verified (HEAD size) before it counts as copied
 *
 * Usage (load secrets from env files, never print them):
 *   node --env-file=.env.production.local --env-file=supabase/functions/.env \
 *     scripts/copy-storage-to-r2.mjs [--apply] [--limit=50] [--concurrency=4]
 *   node --env-file=supabase/functions/.env scripts/copy-storage-to-r2.mjs --selftest
 *
 * Environment:
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY   source
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET   target
 *
 * --selftest writes, reads and deletes one tiny object under `_selftest/` in R2
 * to prove the signer and credentials work; it does not touch Supabase.
 */

import { createHash, createHmac, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const SOURCE_BUCKET = 'photos'
const PAGE_SIZE = 1000

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=')
    return [key, value ?? 'true']
  }),
)
const apply = args.has('apply')
const selftest = args.has('selftest')
const limit = Number.parseInt(args.get('limit') ?? '0', 10)
const concurrency = Math.max(
  1,
  Number.parseInt(args.get('concurrency') ?? '4', 10),
)

function required(name) {
  const value = process.env[name]
  if (value === undefined || value === '') {
    console.error(`${name} is not set`)
    process.exit(2)
  }
  return value
}

// --- Minimal AWS Signature V4 for R2 (path-style, unsigned payload over HTTPS)

const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

function r2Client() {
  const accountId = required('R2_ACCOUNT_ID')
  const accessKeyId = required('R2_ACCESS_KEY_ID')
  const secretAccessKey = required('R2_SECRET_ACCESS_KEY')
  const bucket = required('R2_BUCKET')
  const host = `${accountId}.r2.cloudflarestorage.com`

  function objectPath(key) {
    return `/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`
  }

  async function send(method, key, { body, contentType } = {}) {
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const date = amzDate.slice(0, 8)
    const path = objectPath(key)
    const headers = {
      host,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': amzDate,
      ...(contentType === undefined ? {} : { 'content-type': contentType }),
    }
    const names = Object.keys(headers).sort()
    const canonical = [
      method,
      path,
      '',
      ...names.map((name) => `${name}:${headers[name]}`),
      '',
      names.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n')
    const scope = `${date}/auto/s3/aws4_request`
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join(
      '\n',
    )
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), 'auto'), 's3'),
      'aws4_request',
    )
    const signature = createHmac('sha256', signingKey)
      .update(toSign)
      .digest('hex')
    const { host: _host, ...sendHeaders } = headers
    return fetch(`https://${host}${path}`, {
      body,
      headers: {
        ...sendHeaders,
        authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
      },
      method,
    })
  }

  return {
    /** @returns {Promise<number | null>} object size, or null if missing */
    async size(key) {
      const response = await send('HEAD', key)
      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw new Error(`HEAD ${String(response.status)}`)
      }
      return Number(response.headers.get('content-length'))
    },
    async put(key, body, contentType) {
      const response = await send('PUT', key, { body, contentType })
      if (!response.ok) {
        throw new Error(`PUT ${String(response.status)}`)
      }
    },
    async remove(key) {
      const response = await send('DELETE', key)
      if (!response.ok && response.status !== 404) {
        throw new Error(`DELETE ${String(response.status)}`)
      }
    },
  }
}

// --- Self test

if (selftest) {
  const r2 = r2Client()
  const key = `_selftest/${randomUUID()}.txt`
  const body = Buffer.from('copy-storage-to-r2 selftest')
  await r2.put(key, body, 'text/plain')
  const size = await r2.size(key)
  await r2.remove(key)
  const after = await r2.size(key)
  const ok = size === body.length && after === null
  console.log(JSON.stringify({ afterDelete: after, ok, size }))
  process.exit(ok ? 0 : 1)
}

// --- Copy

const supabase = createClient(
  process.env.SUPABASE_URL ?? required('VITE_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const r2 = r2Client()

async function* variants() {
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('photo_variants')
      .select('storage_path, mime_type, byte_size')
      .order('storage_path')
      .range(from, from + PAGE_SIZE - 1)
    if (error !== null) {
      throw new Error(`read photo_variants: ${error.message}`)
    }
    yield* data
    if (data.length < PAGE_SIZE) {
      return
    }
  }
}

const summary = {
  apply,
  bytesCopied: 0,
  copied: 0,
  failed: 0,
  failures: [],
  skippedExisting: 0,
  total: 0,
  wouldCopy: 0,
}

async function handle(row) {
  const key = row.storage_path
  const expected = Number(row.byte_size)
  const existing = await r2.size(key)
  if (existing === expected) {
    summary.skippedExisting += 1
    return
  }
  if (!apply) {
    summary.wouldCopy += 1
    return
  }
  const { data, error } = await supabase.storage
    .from(SOURCE_BUCKET)
    .download(key)
  if (error !== null) {
    throw new Error(`download: ${error.message}`)
  }
  const body = Buffer.from(await data.arrayBuffer())
  if (body.length !== expected) {
    throw new Error(
      `size mismatch: source ${String(body.length)}, expected ${String(expected)}`,
    )
  }
  await r2.put(key, body, row.mime_type)
  const written = await r2.size(key)
  if (written !== body.length) {
    throw new Error(`verify failed: R2 has ${String(written)} bytes`)
  }
  summary.copied += 1
  summary.bytesCopied += body.length
}

const pending = new Set()
async function schedule(row) {
  summary.total += 1
  const task = handle(row)
    .catch((error) => {
      summary.failed += 1
      if (summary.failures.length < 20) {
        summary.failures.push({
          key: row.storage_path,
          error: String(error.message),
        })
      }
    })
    .finally(() => pending.delete(task))
  pending.add(task)
  if (pending.size >= concurrency) {
    await Promise.race(pending)
  }
}

for await (const row of variants()) {
  if (limit > 0 && summary.total >= limit) {
    break
  }
  await schedule(row)
}
await Promise.all(pending)

console.log(JSON.stringify(summary, null, 2))
process.exit(summary.failed === 0 ? 0 : 1)
