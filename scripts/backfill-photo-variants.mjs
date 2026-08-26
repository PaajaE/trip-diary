/**
 * Idempotent production backfill for canonical photo variants.
 *
 * For each healthy source photo:
 *   1. Ensure `full` exists (copy from legacy `preview` when needed — no recompress)
 *   2. Ensure `small` exists (copy from oversized legacy `thumb` ~800px when needed)
 *   3. Ensure canonical `thumb` ~220px (regenerate when missing or oversized)
 *   4. Ensure `medium` ~1600px (generate from full/preview)
 *
 * Broken/missing source previews are skipped and reported.
 *
 * Usage:
 *   BACKFILL_DRY_RUN=1 pnpm backfill:photo-variants
 *   BACKFILL_LIMIT=3 BACKFILL_PHOTO_IDS=id1,id2,id3 pnpm backfill:photo-variants
 *   pnpm backfill:photo-variants
 *
 * Mutating runs require BACKFILL_MAINTENANCE_TOKEN (Edge writer) or
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  buildPhotoStoragePath,
  isOversizedThumbVariant,
  PHOTO_VARIANT_POLICY,
  resolveMediumDimensions,
  resolveSmallDimensions,
  resolveThumbDimensions,
} from '@trip-diary/utils'

const PHOTOS_BUCKET = 'photos'
const WRITER_FUNCTION = 'maintain-photo-variant-write'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const maintenanceToken = process.env.BACKFILL_MAINTENANCE_TOKEN
const dryRun = process.env.BACKFILL_DRY_RUN === '1'
const dropLegacyPreview = process.env.BACKFILL_DROP_LEGACY_PREVIEW === '1'
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

if (!supabaseUrl) {
  console.error('SUPABASE_URL or VITE_SUPABASE_URL is required.')
  process.exit(1)
}

const hasServiceRole = Boolean(serviceRoleKey)
const hasAnon = Boolean(anonKey)
if (!hasServiceRole && !hasAnon) {
  console.error('Provide SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}
if (!dryRun && !hasServiceRole && !maintenanceToken) {
  console.error(
    'Mutating runs require SUPABASE_SERVICE_ROLE_KEY or BACKFILL_MAINTENANCE_TOKEN.',
  )
  process.exit(1)
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
  await Promise.all(
    Array.from({ length: Math.min(poolSize, items.length) }, () => run()),
  )
  return results
}

async function downloadBytes(storagePath) {
  const { data, error } = await readClient.storage
    .from(PHOTOS_BUCKET)
    .download(storagePath)
  if (error !== null || data === null) {
    throw new Error(error?.message ?? 'download failed')
  }
  if (data.size <= 0) {
    throw new Error('empty object')
  }
  return Buffer.from(await data.arrayBuffer())
}

async function probeObject(storagePath) {
  try {
    const bytes = await downloadBytes(storagePath)
    return { exists: true, size: bytes.byteLength, bytes }
  } catch (error) {
    return {
      exists: false,
      size: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function callWriter(payload) {
  if (writeClient !== null && payload.mode === 'put') {
    const bytes = Buffer.from(payload.bytesBase64, 'base64')
    const { error: uploadError } = await writeClient.storage
      .from(PHOTOS_BUCKET)
      .upload(payload.storagePath, bytes, {
        contentType: payload.mimeType,
        upsert: true,
      })
    if (uploadError !== null) {
      throw new Error(uploadError.message)
    }
    const remote = await probeObject(payload.storagePath)
    if (!remote.exists || remote.size <= 0) {
      throw new Error('remote empty after upload')
    }
    const row = {
      byte_size: remote.size,
      creator_id: payload.creatorId,
      height: payload.height,
      mime_type: payload.mimeType,
      photo_id: payload.photoId,
      storage_path: payload.storagePath,
      variant: payload.variant,
      width: payload.width,
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
        .eq('photo_id', payload.photoId)
        .eq('variant', payload.variant)
        .eq('creator_id', payload.creatorId)
      if (updateError !== null) {
        throw new Error(updateError.message)
      }
    }
    return { remoteSize: remote.size }
  }

  if (writeClient !== null && payload.mode === 'copy') {
    const { error: copyError } = await writeClient.storage
      .from(PHOTOS_BUCKET)
      .copy(payload.fromPath, payload.toPath)
    if (copyError !== null) {
      const source = await downloadBytes(payload.fromPath)
      const { error: uploadError } = await writeClient.storage
        .from(PHOTOS_BUCKET)
        .upload(payload.toPath, source, {
          contentType: payload.mimeType,
          upsert: true,
        })
      if (uploadError !== null) {
        throw new Error(uploadError.message)
      }
    }
    const remote = await probeObject(payload.toPath)
    if (!remote.exists || remote.size <= 0) {
      throw new Error('remote empty after copy')
    }
    const row = {
      byte_size: remote.size,
      creator_id: payload.creatorId,
      height: payload.height,
      mime_type: payload.mimeType,
      photo_id: payload.photoId,
      storage_path: payload.toPath,
      variant: payload.variant,
      width: payload.width,
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
        .eq('photo_id', payload.photoId)
        .eq('variant', payload.variant)
        .eq('creator_id', payload.creatorId)
      if (updateError !== null) {
        throw new Error(updateError.message)
      }
    }
    return { remoteSize: remote.size }
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${WRITER_FUNCTION}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payload, maintenanceToken }),
  })
  const payloadJson = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      `writer ${payload.mode} failed (${String(response.status)}): ${JSON.stringify(payloadJson)}`,
    )
  }
  return payloadJson
}

async function encodeDerivative(sourceBytes, width, height, maxEdge, quality) {
  const plan = resolveVariantLike({ width, height }, maxEdge)
  const thumbBytes = await sharp(sourceBytes, { failOn: 'none' })
    .rotate()
    .resize({
      width: plan.width,
      height: plan.height,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()
  const meta = await sharp(thumbBytes).metadata()
  return {
    bytes: thumbBytes,
    width: meta.width ?? plan.width,
    height: meta.height ?? plan.height,
  }
}

function resolveVariantLike(source, maxEdge) {
  if (maxEdge === PHOTO_VARIANT_POLICY.thumb.maxLongestEdge) {
    return resolveThumbDimensions(source)
  }
  if (maxEdge === PHOTO_VARIANT_POLICY.small.maxLongestEdge) {
    return resolveSmallDimensions(source)
  }
  if (maxEdge === PHOTO_VARIANT_POLICY.medium.maxLongestEdge) {
    return resolveMediumDimensions(source)
  }
  return resolveSmallDimensions(source)
}

async function loadPhotos() {
  const client = writeClient ?? readClient
  const { data: variants, error } = await client
    .from('photo_variants')
    .select(
      'photo_id, creator_id, variant, storage_path, width, height, byte_size, mime_type',
    )
  if (error !== null) {
    throw new Error(error.message)
  }

  const byPhoto = new Map()
  for (const variant of variants ?? []) {
    let row = byPhoto.get(variant.photo_id)
    if (row === undefined) {
      row = {
        photoId: variant.photo_id,
        creatorId: variant.creator_id,
        byVariant: {},
      }
      byPhoto.set(variant.photo_id, row)
    }
    row.byVariant[variant.variant] = variant
  }

  let rows = [...byPhoto.values()]
  if (photoIdFilter.size > 0) {
    rows = rows.filter((row) => photoIdFilter.has(row.photoId))
  }
  rows.sort((a, b) => a.photoId.localeCompare(b.photoId))
  return rows
}

function pickSource(row) {
  return row.byVariant.full ?? row.byVariant.preview ?? null
}

async function processPhoto(row) {
  const actions = []
  const sourceMeta = pickSource(row)
  if (sourceMeta === null) {
    return {
      photoId: row.photoId,
      result: 'skipped_invalid_preview',
      reason: 'no_preview_or_full',
      actions,
      bytesAdded: 0,
    }
  }

  const sourceProbe = await probeObject(sourceMeta.storage_path)
  if (!sourceProbe.exists || sourceProbe.size <= 0) {
    return {
      photoId: row.photoId,
      result: 'skipped_invalid_preview',
      reason: 'source_missing_or_zero',
      actions,
      bytesAdded: 0,
    }
  }

  let sourceBytes = sourceProbe.bytes
  let bytesAdded = 0

  // 1) Ensure full (reuse preview bytes via copy — no recompress)
  if (row.byVariant.full === undefined) {
    const toPath = buildPhotoStoragePath(row.creatorId, row.photoId, 'full', 'jpg')
    if (dryRun) {
      actions.push({ op: 'copy_preview_to_full', bytes: sourceProbe.size })
      bytesAdded += sourceProbe.size
    } else {
      const result = await callWriter({
        mode: 'copy',
        creatorId: row.creatorId,
        photoId: row.photoId,
        fromPath: sourceMeta.storage_path,
        toPath,
        variant: 'full',
        width: sourceMeta.width,
        height: sourceMeta.height,
        byteSize: sourceProbe.size,
        mimeType: sourceMeta.mime_type === 'image/webp' ? 'image/webp' : 'image/jpeg',
      })
      actions.push({ op: 'copied_full', bytes: result.remoteSize })
      bytesAdded += result.remoteSize ?? sourceProbe.size
      row.byVariant.full = {
        ...sourceMeta,
        variant: 'full',
        storage_path: toPath,
        byte_size: result.remoteSize ?? sourceProbe.size,
      }
    }
  } else {
    actions.push({ op: 'skipped_existing_full' })
  }

  // Prefer reading from full path after ensure
  const fullMeta = row.byVariant.full ?? sourceMeta
  if (fullMeta.storage_path !== sourceMeta.storage_path) {
    const fullProbe = await probeObject(fullMeta.storage_path)
    if (fullProbe.exists && fullProbe.bytes) {
      sourceBytes = fullProbe.bytes
    }
  }

  // 2) Ensure small — reuse oversized thumb when possible
  const thumbMeta = row.byVariant.thumb
  const smallMeta = row.byVariant.small
  if (smallMeta === undefined) {
    if (
      thumbMeta !== undefined &&
      isOversizedThumbVariant(thumbMeta.width, thumbMeta.height)
    ) {
      const thumbProbe = await probeObject(thumbMeta.storage_path)
      if (thumbProbe.exists && thumbProbe.size > 0) {
        const toPath = buildPhotoStoragePath(
          row.creatorId,
          row.photoId,
          'small',
          'jpg',
        )
        if (dryRun) {
          actions.push({
            op: 'copy_thumb_to_small',
            bytes: thumbProbe.size,
            width: thumbMeta.width,
            height: thumbMeta.height,
          })
          bytesAdded += thumbProbe.size
        } else {
          const result = await callWriter({
            mode: 'copy',
            creatorId: row.creatorId,
            photoId: row.photoId,
            fromPath: thumbMeta.storage_path,
            toPath,
            variant: 'small',
            width: thumbMeta.width,
            height: thumbMeta.height,
            byteSize: thumbProbe.size,
            mimeType: 'image/jpeg',
          })
          actions.push({ op: 'copied_small_from_thumb', bytes: result.remoteSize })
          bytesAdded += result.remoteSize ?? thumbProbe.size
          row.byVariant.small = {
            ...thumbMeta,
            variant: 'small',
            storage_path: toPath,
            byte_size: result.remoteSize ?? thumbProbe.size,
          }
        }
      } else {
        // Generate small from source
        const generated = await encodeDerivative(
          sourceBytes,
          fullMeta.width,
          fullMeta.height,
          PHOTO_VARIANT_POLICY.small.maxLongestEdge,
          Math.round(PHOTO_VARIANT_POLICY.small.jpegQuality * 100),
        )
        const toPath = buildPhotoStoragePath(
          row.creatorId,
          row.photoId,
          'small',
          'jpg',
        )
        if (dryRun) {
          actions.push({
            op: 'generate_small',
            bytes: generated.bytes.byteLength,
            width: generated.width,
            height: generated.height,
          })
          bytesAdded += generated.bytes.byteLength
        } else {
          const result = await callWriter({
            mode: 'put',
            creatorId: row.creatorId,
            photoId: row.photoId,
            storagePath: toPath,
            variant: 'small',
            width: generated.width,
            height: generated.height,
            byteSize: generated.bytes.byteLength,
            mimeType: 'image/jpeg',
            bytesBase64: generated.bytes.toString('base64'),
          })
          actions.push({ op: 'created_small', bytes: result.remoteSize })
          bytesAdded += result.remoteSize ?? generated.bytes.byteLength
        }
      }
    } else {
      const generated = await encodeDerivative(
        sourceBytes,
        fullMeta.width,
        fullMeta.height,
        PHOTO_VARIANT_POLICY.small.maxLongestEdge,
        Math.round(PHOTO_VARIANT_POLICY.small.jpegQuality * 100),
      )
      const toPath = buildPhotoStoragePath(
        row.creatorId,
        row.photoId,
        'small',
        'jpg',
      )
      if (dryRun) {
        actions.push({
          op: 'generate_small',
          bytes: generated.bytes.byteLength,
          width: generated.width,
          height: generated.height,
        })
        bytesAdded += generated.bytes.byteLength
      } else {
        const result = await callWriter({
          mode: 'put',
          creatorId: row.creatorId,
          photoId: row.photoId,
          storagePath: toPath,
          variant: 'small',
          width: generated.width,
          height: generated.height,
          byteSize: generated.bytes.byteLength,
          mimeType: 'image/jpeg',
          bytesBase64: generated.bytes.toString('base64'),
        })
        actions.push({ op: 'created_small', bytes: result.remoteSize })
        bytesAdded += result.remoteSize ?? generated.bytes.byteLength
      }
    }
  } else {
    actions.push({ op: 'skipped_existing_small' })
  }

  // 3) Ensure canonical thumb ~220 (regenerate if missing or oversized)
  const needsThumbRegen =
    thumbMeta === undefined ||
    isOversizedThumbVariant(thumbMeta.width, thumbMeta.height)
  if (needsThumbRegen) {
    const generated = await encodeDerivative(
      sourceBytes,
      fullMeta.width,
      fullMeta.height,
      PHOTO_VARIANT_POLICY.thumb.maxLongestEdge,
      Math.round(PHOTO_VARIANT_POLICY.thumb.jpegQuality * 100),
    )
    const toPath = buildPhotoStoragePath(
      row.creatorId,
      row.photoId,
      'thumb',
      'jpg',
    )
    if (dryRun) {
      actions.push({
        op: thumbMeta === undefined ? 'generate_thumb' : 'regenerate_thumb',
        bytes: generated.bytes.byteLength,
        width: generated.width,
        height: generated.height,
      })
      bytesAdded += generated.bytes.byteLength
    } else {
      const result = await callWriter({
        mode: 'put',
        creatorId: row.creatorId,
        photoId: row.photoId,
        storagePath: toPath,
        variant: 'thumb',
        width: generated.width,
        height: generated.height,
        byteSize: generated.bytes.byteLength,
        mimeType: 'image/jpeg',
        bytesBase64: generated.bytes.toString('base64'),
      })
      actions.push({
        op: thumbMeta === undefined ? 'created_thumb' : 'repaired_thumb',
        bytes: result.remoteSize,
      })
      bytesAdded += result.remoteSize ?? generated.bytes.byteLength
    }
  } else {
    actions.push({ op: 'skipped_existing_thumb' })
  }

  // 4) Ensure medium
  if (row.byVariant.medium === undefined) {
    const generated = await encodeDerivative(
      sourceBytes,
      fullMeta.width,
      fullMeta.height,
      PHOTO_VARIANT_POLICY.medium.maxLongestEdge,
      Math.round(PHOTO_VARIANT_POLICY.medium.jpegQuality * 100),
    )
    const toPath = buildPhotoStoragePath(
      row.creatorId,
      row.photoId,
      'medium',
      'jpg',
    )
    if (dryRun) {
      actions.push({
        op: 'generate_medium',
        bytes: generated.bytes.byteLength,
        width: generated.width,
        height: generated.height,
      })
      bytesAdded += generated.bytes.byteLength
    } else {
      const result = await callWriter({
        mode: 'put',
        creatorId: row.creatorId,
        photoId: row.photoId,
        storagePath: toPath,
        variant: 'medium',
        width: generated.width,
        height: generated.height,
        byteSize: generated.bytes.byteLength,
        mimeType: 'image/jpeg',
        bytesBase64: generated.bytes.toString('base64'),
      })
      actions.push({ op: 'created_medium', bytes: result.remoteSize })
      bytesAdded += result.remoteSize ?? generated.bytes.byteLength
    }
  } else {
    actions.push({ op: 'skipped_existing_medium' })
  }

  // Optional: drop legacy preview after full exists (saves duplicate master bytes)
  if (
    dropLegacyPreview &&
    !dryRun &&
    row.byVariant.preview !== undefined &&
    row.byVariant.full !== undefined
  ) {
    await callWriter({
      mode: 'delete_variant',
      creatorId: row.creatorId,
      photoId: row.photoId,
      storagePath: row.byVariant.preview.storage_path,
      variant: 'preview',
    })
    actions.push({ op: 'deleted_legacy_preview' })
  }

  const created = actions.some((action) =>
    [
      'copied_full',
      'copied_small_from_thumb',
      'created_small',
      'created_thumb',
      'repaired_thumb',
      'created_medium',
      'copy_preview_to_full',
      'copy_thumb_to_small',
      'generate_small',
      'generate_thumb',
      'regenerate_thumb',
      'generate_medium',
    ].includes(action.op),
  )

  return {
    photoId: row.photoId,
    result: created ? (dryRun ? 'would_update' : 'updated') : 'skipped_existing',
    actions,
    bytesAdded,
  }
}

async function main() {
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'mutate',
        writer: writeClient !== null ? 'service_role' : 'edge_function',
        dropLegacyPreview,
        limit,
        concurrency,
        photoIdFilter: [...photoIdFilter],
      },
      null,
      2,
    ),
  )

  const rows = await loadPhotos()
  console.log(`Loaded ${rows.length} photos with variant rows`)

  const bounded = rows.slice(0, limit)
  const results = await mapPool(bounded, concurrency, async (row) => {
    try {
      const result = await processPhoto(row)
      console.log(
        `${result.result} ${result.photoId} bytes+=${String(result.bytesAdded)} ` +
          result.actions.map((action) => action.op).join(','),
      )
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`failed ${row.photoId}: ${message}`)
      return {
        photoId: row.photoId,
        result: 'failed',
        reason: message,
        actions: [],
        bytesAdded: 0,
      }
    }
  })

  const summary = {
    inspected: results.length,
    updated: results.filter((r) => r.result === 'updated' || r.result === 'would_update')
      .length,
    skipped_existing: results.filter((r) => r.result === 'skipped_existing').length,
    skipped_invalid_preview: results.filter(
      (r) => r.result === 'skipped_invalid_preview',
    ).length,
    failed: results.filter((r) => r.result === 'failed').length,
    bytesAdded: results.reduce((sum, r) => sum + (r.bytesAdded ?? 0), 0),
  }

  console.log('--- summary ---')
  console.log(JSON.stringify(summary, null, 2))

  const reportPath = join(
    homedir(),
    'Downloads',
    `trip-diary-variant-backfill-${dryRun ? 'dryrun' : 'run'}-${Date.now()}.json`,
  )
  writeFileSync(
    reportPath,
    JSON.stringify({ summary, results }, null, 2),
  )
  console.log(`Wrote report ${reportPath}`)
}

await main()
