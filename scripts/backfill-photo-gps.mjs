/**
 * Backfill missing photo GPS coordinates from Supabase Storage originals.
 *
 * Usage:
 *   pnpm backfill:photo-gps
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY
 * in .env.local, or pass them as environment variables.
 *
 * Optional:
 *   BACKFILL_LIMIT=100
 *   BACKFILL_DRY_RUN=1
 */

import { createClient } from '@supabase/supabase-js'
import exifr from 'exifr'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const limit = Number.parseInt(process.env.BACKFILL_LIMIT ?? '200', 10)
const dryRun = process.env.BACKFILL_DRY_RUN === '1'

if (supabaseUrl === undefined || serviceRoleKey === undefined) {
  console.error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.',
  )
  process.exit(1)
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function isMeaningfulGps(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  )
}

async function extractGpsFromStoragePath(storagePath) {
  const { data, error } = await client.storage.from('photos').download(storagePath)
  if (error !== null) {
    throw error
  }

  const buffer = await data.arrayBuffer()
  const gps = await exifr.gps(buffer).catch(() => undefined)
  if (
    gps === undefined ||
    !isMeaningfulGps(gps.latitude, gps.longitude)
  ) {
    return null
  }

  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
  }
}

async function main() {
  const { data: photos, error } = await client
    .from('photos')
    .select('id, creator_id')
    .is('latitude', null)
    .limit(limit)

  if (error !== null) {
    throw error
  }

  let updated = 0
  let skipped = 0

  for (const photo of photos ?? []) {
    const { data: variants, error: variantError } = await client
      .from('photo_variants')
      .select('storage_path, variant')
      .eq('photo_id', photo.id)
      .in('variant', ['large', 'preview'])

    if (variantError !== null) {
      console.error(`Variant lookup failed for ${photo.id}:`, variantError.message)
      skipped += 1
      continue
    }

    const storagePath =
      variants?.find((variant) => variant.variant === 'large')?.storage_path ??
      variants?.find((variant) => variant.variant === 'preview')?.storage_path

    if (storagePath === undefined) {
      skipped += 1
      continue
    }

    try {
      const gps = await extractGpsFromStoragePath(storagePath)
      if (gps === null) {
        skipped += 1
        continue
      }

      if (dryRun) {
        console.log(
          `[dry-run] ${photo.id} -> ${gps.latitude}, ${gps.longitude}`,
        )
        updated += 1
        continue
      }

      const { error: updateError } = await client
        .from('photos')
        .update({
          latitude: gps.latitude,
          longitude: gps.longitude,
        })
        .eq('id', photo.id)

      if (updateError !== null) {
        console.error(`Update failed for ${photo.id}:`, updateError.message)
        skipped += 1
        continue
      }

      updated += 1
      console.log(`Updated ${photo.id}`)
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Unknown extraction error'
      console.error(`Failed ${photo.id}:`, message)
      skipped += 1
    }
  }

  console.log(
    `Done. Updated ${updated}, skipped ${skipped}, scanned ${photos?.length ?? 0}.`,
  )
}

await main()
