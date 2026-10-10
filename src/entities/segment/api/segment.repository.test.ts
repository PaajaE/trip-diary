import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptSuggestedSegment,
  createSegment,
  deleteSegment,
  listJourneySegments,
  updateSegment,
} from '@/entities/segment/api/segment.repository'
import { SegmentError } from '@/entities/segment/model/segment'

const J = '11111111-1111-4111-8111-111111111111'
const S = '22222222-2222-4222-8222-222222222222'

const row = {
  body: '',
  cover_media_id: null,
  created_at: '2026-01-01T10:00:00+00:00',
  created_by: J,
  ends_at: '2026-01-03T10:00:00+00:00',
  id: S,
  journey_id: J,
  kind: 'stage',
  origin: 'suggested',
  parent_id: null,
  position: 0,
  starts_at: '2026-01-01T10:00:00+00:00',
  title: 'Alps',
  trip_type: null,
  tz: 'Europe/Prague',
  updated_at: '2026-01-01T10:00:00+00:00',
}

const calls: string[] = []
let result: { data: unknown; error: unknown } = { data: null, error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'order',
  'single',
  'maybeSingle',
]) {
  chain[name] = vi.fn((...args: unknown[]) => {
    calls.push(`${name}:${JSON.stringify(args)}`)
    return name === 'single' || name === 'maybeSingle' || name === 'order'
      ? Object.assign(Promise.resolve(result), chain)
      : Object.assign(Promise.resolve(result), chain)
  })
}
const from = vi.fn((table: string) => {
  void table
  return chain
})

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
  result = { data: null, error: null }
})

describe('segment repository', () => {
  it('lists by journey and parses rows', async () => {
    result = { data: [row], error: null }
    const segments = await listJourneySegments(J)
    expect(from).toHaveBeenCalledWith('segments')
    expect(calls).toContain(`eq:${JSON.stringify(['journey_id', J])}`)
    expect(segments[0]).toMatchObject({
      kind: 'stage',
      title: 'Alps',
      tz: 'Europe/Prague',
    })
  })

  it('rejects malformed rows', async () => {
    result = { data: [{ ...row, kind: 'bogus' }], error: null }
    await expect(listJourneySegments(J)).rejects.toMatchObject({
      code: 'invalid_row',
    })
  })

  it('maps list errors', async () => {
    result = { data: null, error: { message: 'boom' } }
    await expect(listJourneySegments(J)).rejects.toBeInstanceOf(SegmentError)
  })

  it('creates with granted columns only', async () => {
    result = { data: row, error: null }
    await createSegment({
      createdBy: J,
      endsAt: row.ends_at,
      id: S,
      journeyId: J,
      kind: 'stage',
      startsAt: row.starts_at,
      title: 'Alps',
    })
    const insertCall = chain.insert?.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(Object.keys(insertCall).sort()).toEqual([
      'created_by',
      'ends_at',
      'id',
      'journey_id',
      'kind',
      'starts_at',
      'title',
    ])
  })

  it('rejects a trip without trip type and a stage with a parent', async () => {
    const base = {
      createdBy: J,
      endsAt: 'e',
      id: S,
      journeyId: J,
      startsAt: 's',
      title: 't',
    }
    await expect(
      createSegment({ ...base, kind: 'trip' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      createSegment({ ...base, kind: 'stage', parentId: J }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(from).not.toHaveBeenCalled()
  })

  it('updates only defined columns and reports not_found', async () => {
    result = { data: null, error: null }
    await expect(
      updateSegment(S, { title: 'X', coverMediaId: null }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(chain.update).toHaveBeenCalledWith({
      cover_media_id: null,
      title: 'X',
    })
    await expect(updateSegment(S, {})).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })

  it('accepts only suggested segments', async () => {
    result = { data: { ...row, origin: 'accepted' }, error: null }
    const accepted = await acceptSuggestedSegment(S)
    expect(accepted.origin).toBe('accepted')
    expect(chain.update).toHaveBeenCalledWith({ origin: 'accepted' })
    expect(calls).toContain(`eq:${JSON.stringify(['origin', 'suggested'])}`)
  })

  it('maps delete errors', async () => {
    result = { data: null, error: { message: 'no' } }
    await expect(deleteSegment(S)).rejects.toMatchObject({
      code: 'delete_failed',
    })
  })
})
