/**
 * Idempotent production thumb backfill from existing remote preview variants.
 *
 * Policy (matches mobile pipeline):
 *   - longest edge ~800px, never upscale
 *   - preserve aspect ratio (including panoramas)
 *   - JPEG quality 0.75
 *   - Storage path: {creatorId}/{photoId}/thumb.jpg
 *   - upload + verify non-zero, then upsert photo_variants.thumb
 *
 * Usage:
 *   BACKFILL_DRY_RUN=1 pnpm backfill:photo-thumbs
 *   BACKFILL_LIMIT=3 BACKFILL_PHOTO_IDS=id1,id2,id3 pnpm backfill:photo-thumbs
 *   pnpm backfill:photo-thumbs
 *
 * Auth:
 *   Prefer SUPABASE_SERVICE_ROLE_KEY for direct Storage/DB writes.
 *   A temporary gated Edge Function writer was used once for production
 *   backfill and has been retired (410). Redeploy only for a controlled
 *   maintenance window if service-role access is unavailable locally.
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY
 * for mutating runs. Dry-run can use VITE_SUPABASE_ANON_KEY for reads.
 *
 * Optional:
 *   BACKFILL_LIMIT=50
 *   BACKFILL_DRY_RUN=1
 *   BACKFILL_PHOTO_IDS=uuid,uuid
 *   BACKFILL_CONCURRENCY=2
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const THUMB_MAX_LONGEST_EDGE = 800
const THUMB_JPEG_QUALITY = 75
const PANORAMA_ASPECT_RATIO_THRESHOLD = 1.8
const PHOTOS_BUCKET = 'photos'
const DEFAULT_WRITER_FUNCTION = 'maintain-photo-thumb-put'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const maintenanceToken = process.env.BACKFILL_MAINTENANCE_TOKEN
const dryRun = process.env.BACKFILL_DRY_RUN === '1'
const limit = Number.parseInt(process.env.BACKFILL_LIMIT ?? '500', 10)
const concurrency = Math.max(
  1,
  Number.parseInt(process.env.BACKFILL_CONCURRENCY ?? '2', 10),
)
const photoIdFilter = new Set(
  (process.env.BACKFILL_PHOTO_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
)

if (supabaseUrl === undefined || supabaseUrl.length === 0) {
  console.error('SUPABASE_URL or VITE_SUPABASE_URL is required.')
  process.exit(1)
}

const hasServiceRole =
  serviceRoleKey !== undefined && serviceRoleKey.length > 0
const hasAnon = anonKey !== undefined && anonKey.length > 0

if (!hasServiceRole && !hasAnon) {
  console.error(
    'Provide SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.',
  )
  process.exit(1)
}

if (!dryRun && !hasServiceRole) {
  if (maintenanceToken === undefined || maintenanceToken.length === 0) {
    console.error(
      'Mutating runs without SERVICE_ROLE_KEY require BACKFILL_MAINTENANCE_TOKEN.',
    )
    process.exit(1)
  }
}

const readClient = createClient(
  supabaseUrl,
  hasServiceRole ? serviceRoleKey : anonKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const writeClient = hasServiceRole
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

function resolveThumbDimensions(width, height) {
  const w = Math.max(1, Math.trunc(width))
  const h = Math.max(1, Math.trunc(height))
  const longest = Math.max(w, h)
  if (longest <= THUMB_MAX_LONGEST_EDGE) {
    return { width: w, height: h }
  }
  const scale = THUMB_MAX_LONGEST_EDGE / longest
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

function isPanorama(width, height) {
  const longEdge = Math.max(width, height)
  const shortEdge = Math.min(width, height)
  return longEdge / shortEdge >= PANORAMA_ASPECT_RATIO_THRESHOLD
}

function buildThumbPath(creatorId, photoId) {
  return `${creatorId}/${photoId}/thumb.jpg`
}

function looksLikeJpeg(bytes) {
  return (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
}

async function mapPool(items, poolSize, worker) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function run() {
    while (nextIndex < items.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await worker(items[current], current)
    }
  }

  const runners = Array.from(
    { length: Math.min(poolSize, items.length) },
    () => run(),
  )
  await Promise.all(runners)
  return results
}

async function listStorageObjectSize(client, storagePath) {
  const slash = storagePath.lastIndexOf('/')
  if (slash <= 0) {
    return { exists: false, size: 0 }
  }
  const folder = storagePath.slice(0, slash)
  const fileName = storagePath.slice(slash + 1)
  const { data, error } = await client.storage.from(PHOTOS_BUCKET).list(folder, {
    limit: 100,
    search: fileName,
  })
  if (error !== null) {
    return { exists: false, size: 0, error: error.message }
  }
  const match = (data ?? []).find((row) => row.name === fileName)
  if (match === undefined) {
    return { exists: false, size: 0 }
  }
  const metadata = match.metadata
  const size =
    metadata && typeof metadata.size === 'number' ? metadata.size : -1
  if (size >= 0) {
    return { exists: true, size }
  }
  const { data: blob, error: downloadError } = await client.storage
    .from(PHOTOS_BUCKET)
    .download(storagePath)
  if (downloadError !== null || blob === null) {
    return { exists: false, size: 0, error: downloadError?.message }
  }
  return { exists: true, size: blob.size }
}

async function downloadPreviewBytes(storagePath) {
  const { data, error } = await readClient.storage
    .from(PHOTOS_BUCKET)
    .download(storagePath)
  if (error !== null || data === null) {
    throw new Error(error?.message ?? 'preview download failed')
  }
  if (data.size <= 0) {
    throw new Error('preview object is empty')
  }
  const buffer = Buffer.from(await data.arrayBuffer())
  if (!looksLikeJpeg(buffer) && !storagePath.endsWith('.webp')) {
    // Still allow decode via sharp; just note non-jpeg headers.
  }
  return buffer
}

async function generateThumbBuffer(previewBytes, previewWidth, previewHeight) {
  const plan = resolveThumbDimensions(previewWidth, previewHeight)
  const image = sharp(previewBytes, { failOn: 'none' }).rotate()
  const resized = image.resize({
    width: plan.width,
    height: plan.height,
    fit: 'inside',
    withoutEnlargement: true,
  })
  const thumbBytes = await resized
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
  const meta = await sharp(thumbBytes).metadata()
  const width = meta.width ?? plan.width
  const height = meta.height ?? plan.height
  return { thumbBytes, width, height }
}

async function putThumbViaServiceRole({
  photoId,
  creatorId,
  storagePath,
  thumbBytes,
  width,
  height,
}) {
  const { error: uploadError } = await writeClient.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, thumbBytes, {
      contentType: 'image/jpeg',
      upsert: true,
    })
  if (uploadError !== null) {
    throw new Error(`upload failed: ${uploadError.message}`)
  }

  const verified = await listStorageObjectSize(writeClient, storagePath)
  if (!verified.exists || verified.size <= 0) {
    throw new Error(
      `remote thumb empty after upload: ${storagePath} (${verified.error ?? 'no size'})`,
    )
  }

  const row = {
    byte_size: verified.size,
    creator_id: creatorId,
    height,
    mime_type: 'image/jpeg',
    photo_id: photoId,
    storage_path: storagePath,
    variant: 'thumb',
    width,
  }

  const { error: insertError } = await writeClient
    .from('photo_variants')
    .insert(row)

  if (insertError !== null) {
    const { error: updateError } = await writeClient
      .from('photo_variants')
      .update({
        byte_size: row.byte_size,
        height: row.height,
        mime_type: row.mime_type,
        storage_path: row.storage_path,
        width: row.width,
      })
      .eq('photo_id', photoId)
      .eq('variant', 'thumb')
      .eq('creator_id', creatorId)

    if (updateError !== null) {
      throw new Error(
        `variant upsert failed: ${updateError.message} / ${insertError.message}`,
      )
    }
  }

  return verified.size
}

async function putThumbViaEdgeFunction({
  photoId,
  creatorId,
  storagePath,
  thumbBytes,
  width,
  height,
}) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/${DEFAULT_WRITER_FUNCTION}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        byteSize: thumbBytes.byteLength,
        creatorId,
        height,
        maintenanceToken,
        mimeType: 'image/jpeg',
        photoId,
        storagePath,
        thumbBase64: thumbBytes.toString('base64'),
        width,
      }),
    },
  )

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      `edge writer failed (${String(response.status)}): ${JSON.stringify(payload)}`,
    )
  }
  return payload.remoteSize ?? thumbBytes.byteLength
}

async function loadCandidateRows() {
  // Prefer variants as the inventory source: anon RLS can hide photos rows
  // while still exposing declared preview/thumb variants for shared content.
  const client = writeClient ?? readClient
  const { data: variants, error: variantsError } = await client
    .from('photo_variants')
    .select(
      'photo_id, creator_id, variant, storage_path, width, height, byte_size, mime_type',
    )

  if (variantsError !== null) {
    throw new Error(`photo_variants query failed: ${variantsError.message}`)
  }

  const byPhoto = new Map()
  for (const variant of variants ?? []) {
    let row = byPhoto.get(variant.photo_id)
    if (row === undefined) {
      row = {
        photoId: variant.photo_id,
        creatorId: variant.creator_id,
        preview: null,
        thumb: null,
      }
      byPhoto.set(variant.photo_id, row)
    }
    if (variant.variant === 'preview') {
      row.preview = variant
    }
    if (variant.variant === 'thumb') {
      row.thumb = variant
    }
  }

  let rows = [...byPhoto.values()].filter((row) => row.preview !== null)
  if (photoIdFilter.size > 0) {
    rows = rows.filter((row) => photoIdFilter.has(row.photoId))
  }
  rows.sort((a, b) => a.photoId.localeCompare(b.photoId))
  return rows
}

async function classifyRow(row) {
  if (row.preview === null) {
    return {
      action: 'skipped_invalid_preview',
      reason: 'no_preview_variant',
      estimatedBytes: 0,
    }
  }

  const previewRemote = await listStorageObjectSize(
    readClient,
    row.preview.storage_path,
  )
  // Fall back to download probe when list is inconclusive under anon.
  let previewValid = previewRemote.exists && previewRemote.size > 0
  if (!previewValid) {
    try {
      const bytes = await downloadPreviewBytes(row.preview.storage_path)
      previewValid = bytes.byteLength > 0
      previewRemote.exists = previewValid
      previewRemote.size = bytes.byteLength
    } catch {
      previewValid = false
    }
  }

  if (!previewValid) {
    return {
      action: 'skipped_invalid_preview',
      reason: 'preview_missing_or_zero',
      estimatedBytes: 0,
      previewStorageBytes: previewRemote.size,
      previewDbBytes: row.preview.byte_size,
    }
  }

  if (row.thumb !== null) {
    const thumbRemote = await listStorageObjectSize(
      readClient,
      row.thumb.storage_path,
    )
    let thumbValid = thumbRemote.exists && thumbRemote.size > 0
    if (!thumbValid) {
      try {
        const { data, error } = await readClient.storage
          .from(PHOTOS_BUCKET)
          .download(row.thumb.storage_path)
        thumbValid =
          error === null && data !== null && data.size > 0
        thumbRemote.size = data?.size ?? 0
      } catch {
        thumbValid = false
      }
    }
    if (thumbValid && row.thumb.byte_size > 0) {
      return {
        action: 'skipped_existing',
        reason: 'valid_thumb',
        estimatedBytes: 0,
        thumbBytes: thumbRemote.size || row.thumb.byte_size,
      }
    }
    return {
      action: 'repair',
      reason: 'thumb_db_or_storage_invalid',
      estimatedBytes: Math.round(previewRemote.size * 0.03),
      previewStorageBytes: previewRemote.size,
    }
  }

  return {
    action: 'create',
    reason: 'missing_thumb',
    estimatedBytes: Math.round(previewRemote.size * 0.03),
    previewStorageBytes: previewRemote.size,
    isPanorama: isPanorama(row.preview.width, row.preview.height),
  }
}

async function processRow(row, classification) {
  if (
    classification.action === 'skipped_existing' ||
    classification.action === 'skipped_invalid_preview'
  ) {
    return {
      photoId: row.photoId,
      result: classification.action,
      reason: classification.reason,
      bytesAdded: 0,
    }
  }

  const previewBytes = await downloadPreviewBytes(row.preview.storage_path)
  const generated = await generateThumbBuffer(
    previewBytes,
    row.preview.width,
    row.preview.height,
  )

  if (generated.thumbBytes.byteLength === 0) {
    throw new Error('generated thumb is empty')
  }

  const storagePath = buildThumbPath(row.creatorId, row.photoId)

  if (dryRun) {
    return {
      photoId: row.photoId,
      result: classification.action === 'repair' ? 'repair' : 'create',
      dryRun: true,
      thumbWidth: generated.width,
      thumbHeight: generated.height,
      thumbBytes: generated.thumbBytes.byteLength,
      isPanorama: isPanorama(row.preview.width, row.preview.height),
      bytesAdded: generated.thumbBytes.byteLength,
    }
  }

  const put = writeClient !== null ? putThumbViaServiceRole : putThumbViaEdgeFunction
  const remoteSize = await put({
    photoId: row.photoId,
    creatorId: row.creatorId,
    storagePath,
    thumbBytes: generated.thumbBytes,
    width: generated.width,
    height: generated.height,
  })

  return {
    photoId: row.photoId,
    result: classification.action === 'repair' ? 'repaired' : 'created',
    thumbWidth: generated.width,
    thumbHeight: generated.height,
    thumbBytes: remoteSize,
    isPanorama: isPanorama(row.preview.width, row.preview.height),
    bytesAdded: remoteSize,
  }
}

function summarize(results) {
  const counts = {
    skipped_existing: 0,
    created: 0,
    repaired: 0,
    skipped_invalid_preview: 0,
    failed: 0,
    create: 0,
    repair: 0,
  }
  let bytesAdded = 0
  for (const item of results) {
    counts[item.result] = (counts[item.result] ?? 0) + 1
    bytesAdded += item.bytesAdded ?? 0
  }
  return { counts, bytesAdded }
}

async function main() {
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'mutate',
        writer: writeClient !== null ? 'service_role' : 'edge_function',
        limit,
        concurrency,
        photoIdFilter: [...photoIdFilter],
      },
      null,
      2,
    ),
  )

  const rows = await loadCandidateRows()
  console.log(`Loaded ${rows.length} photos`)

  const classified = await mapPool(rows, concurrency, async (row) => {
    try {
      const classification = await classifyRow(row)
      return { row, classification, error: null }
    } catch (error) {
      return {
        row,
        classification: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  const actionable = []
  const earlyResults = []

  for (const item of classified) {
    if (item.error !== null) {
      earlyResults.push({
        photoId: item.row.photoId,
        result: 'failed',
        reason: item.error,
        bytesAdded: 0,
      })
      console.log(`failed ${item.row.photoId} classify: ${item.error}`)
      continue
    }

    const { action } = item.classification
    if (action === 'skipped_existing' || action === 'skipped_invalid_preview') {
      earlyResults.push({
        photoId: item.row.photoId,
        result: action,
        reason: item.classification.reason,
        bytesAdded: 0,
      })
      console.log(`${action} ${item.row.photoId} (${item.classification.reason})`)
      continue
    }

    actionable.push(item)
  }

  const bounded = actionable.slice(0, limit)
  console.log(
    `Actionable=${actionable.length}; processing=${bounded.length}; dryRun=${String(dryRun)}`,
  )

  const processed = await mapPool(bounded, concurrency, async (item) => {
    try {
      const result = await processRow(item.row, item.classification)
      console.log(
        `${result.result} ${result.photoId}` +
          (result.thumbWidth !== undefined
            ? ` ${result.thumbWidth}x${result.thumbHeight} ${result.thumbBytes}B` +
              (result.isPanorama ? ' panorama' : '')
            : ''),
      )
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`failed ${item.row.photoId}: ${message}`)
      return {
        photoId: item.row.photoId,
        result: 'failed',
        reason: message,
        bytesAdded: 0,
      }
    }
  })

  const allResults = [...earlyResults, ...processed]
  const summary = summarize(allResults)

  // Inventory-level dry-run stats (before limit) for the report.
  const inventory = {
    photos: rows.length,
    validPreviewSources: classified.filter(
      (item) =>
        item.classification !== null &&
        item.classification.action !== 'skipped_invalid_preview',
    ).length,
    alreadyValidThumbs: classified.filter(
      (item) => item.classification?.action === 'skipped_existing',
    ).length,
    missingThumbs: classified.filter(
      (item) => item.classification?.action === 'create',
    ).length,
    repairableBrokenThumbs: classified.filter(
      (item) => item.classification?.action === 'repair',
    ).length,
    cannotProcess: classified.filter(
      (item) =>
        item.error !== null ||
        item.classification?.action === 'skipped_invalid_preview',
    ).length,
    estimatedStorageAddedBytes: classified
      .filter(
        (item) =>
          item.classification?.action === 'create' ||
          item.classification?.action === 'repair',
      )
      .reduce((sum, item) => sum + (item.classification?.estimatedBytes ?? 0), 0),
  }

  console.log('--- inventory ---')
  console.log(JSON.stringify(inventory, null, 2))
  console.log('--- run summary ---')
  console.log(JSON.stringify({ ...summary.counts, bytesAdded: summary.bytesAdded }, null, 2))

  const reportPath = join(
    homedir(),
    'Downloads',
    `trip-diary-thumb-backfill-${dryRun ? 'dryrun' : 'run'}-${Date.now()}.json`,
  )
  try {
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          inventory,
          summary: summary.counts,
          bytesAdded: summary.bytesAdded,
          results: allResults,
        },
        null,
        2,
      ),
    )
    console.log(`Wrote report ${reportPath}`)
  } catch {
    // Optional local report; ignore failures.
  }
}

await main()
