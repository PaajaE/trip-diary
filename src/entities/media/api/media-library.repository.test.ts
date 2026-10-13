import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assignMediaToMoment,
  listJourneyMedia,
  updateMediaMeta,
} from '@/entities/media/api/media-library.repository'

const J = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const variant = {
  byte_size: 1000,
  created_at: '2026-01-01T10:00:00+00:00',
  height: 10,
  kind: 'thumb',
  media_id: A,
  mime_type: 'image/webp',
  storage_key: 'u/a/thumb.webp',
  width: 10,
}
const row = {
  altitude: null,
  caption: null,
  captured_at: '2026-01-01T10:00:00+00:00',
  captured_tz: 'Europe/Prague',
  content_hash: null,
  created_at: '2026-01-01T10:00:00+00:00',
  duration_ms: null,
  focal_x: null,
  focal_y: null,
  height: 10,
  hide_location: false,
  id: A,
  journey_id: J,
  kind: 'photo',
  latitude: null,
  longitude: null,
  media_variants: [variant],
  moment_id: null,
  owner_id: J,
  segment_override_id: null,
  source_asset_id: null,
  starred: false,
  status: 'ready',
  updated_at: '2026-01-01T10:00:00+00:00',
  width: 10,
}

let result: { data: unknown; error: unknown } = { data: null, error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['select', 'update', 'eq', 'order', 'maybeSingle']) {
  chain[name] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}
const from = vi.fn((table: string) => {
  void table
  return chain
})
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: null, error: null }
})

describe('media library repository', () => {
  it('lists media with embedded variants', async () => {
    result = { data: [row], error: null }
    const items = await listJourneyMedia(J)
    expect(from).toHaveBeenCalledWith('media')
    expect(chain.select).toHaveBeenCalledWith('*, media_variants(*)')
    expect(chain.eq).toHaveBeenCalledWith('journey_id', J)
    expect(items[0]?.variants[0]).toMatchObject({
      kind: 'thumb',
      storageKey: 'u/a/thumb.webp',
    })
  })

  it('rejects rows with a bad variant mime type', async () => {
    result = {
      data: [
        { ...row, media_variants: [{ ...variant, mime_type: 'text/html' }] },
      ],
      error: null,
    }
    await expect(listJourneyMedia(J)).rejects.toMatchObject({
      code: 'invalid_row',
    })
  })

  it('updates metadata with granted columns only', async () => {
    result = { data: { ...row, starred: true }, error: null }
    const item = await updateMediaMeta(A, {
      focalX: 0.5,
      focalY: 0.5,
      starred: true,
    })
    expect(chain.update).toHaveBeenCalledWith({
      focal_x: 0.5,
      focal_y: 0.5,
      starred: true,
    })
    expect(item.starred).toBe(true)
    await expect(updateMediaMeta(A, {})).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })

  it('assigns and detaches moments', async () => {
    result = { data: row, error: null }
    await assignMediaToMoment(A, null)
    expect(chain.update).toHaveBeenCalledWith({ moment_id: null })
  })

  it('maps update errors and missing rows', async () => {
    result = { data: null, error: { message: 'fk' } }
    await expect(assignMediaToMoment(A, J)).rejects.toMatchObject({
      code: 'update_failed',
    })
    result = { data: null, error: null }
    await expect(assignMediaToMoment(A, J)).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
