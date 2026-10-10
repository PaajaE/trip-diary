import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getJourneyCover,
  setJourneyCover,
} from '@/entities/journey/api/journey-cover.repository'
import { JourneyCoverError } from '@/entities/journey/model/journey-cover'

const J = '11111111-1111-4111-8111-111111111111'
const M = '22222222-2222-4222-8222-222222222222'

let result: { data: unknown; error: unknown } = { data: null, error: null }
const calls: string[] = []
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['select', 'update', 'eq', 'maybeSingle']) {
  chain[name] = vi.fn((...args: unknown[]) => {
    calls.push(`${name}:${JSON.stringify(args)}`)
    return Object.assign(Promise.resolve(result), chain)
  })
}
const from = vi.fn(() => chain)
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
  result = { data: null, error: null }
})

describe('journey cover repository', () => {
  it('updates only cover_media_id for the journey', async () => {
    result = { data: { id: J }, error: null }
    await setJourneyCover(J, M)
    expect(from).toHaveBeenCalledWith('journeys')
    expect(calls).toContain(`update:${JSON.stringify([{ cover_media_id: M }])}`)
    expect(calls).toContain(`eq:${JSON.stringify(['id', J])}`)
  })

  it('clears the cover with null', async () => {
    result = { data: { id: J }, error: null }
    await setJourneyCover(J, null)
    expect(calls).toContain(
      `update:${JSON.stringify([{ cover_media_id: null }])}`,
    )
  })

  it('rejects a non-uuid media id without calling the database', async () => {
    await expect(setJourneyCover(J, 'nope')).rejects.toMatchObject({
      code: 'invalid_input',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('maps database errors and missing rows to typed errors', async () => {
    result = { data: null, error: { message: 'denied' } }
    await expect(setJourneyCover(J, M)).rejects.toMatchObject({
      code: 'update_failed',
    })
    result = { data: null, error: null }
    const err = await setJourneyCover(J, M).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JourneyCoverError)
    expect(err).toMatchObject({ code: 'not_found' })
  })

  it('reads the current cover id', async () => {
    result = { data: { cover_media_id: M }, error: null }
    expect(await getJourneyCover(J)).toBe(M)
    result = { data: null, error: null }
    expect(await getJourneyCover(J)).toBeNull()
    result = { data: null, error: { message: 'x' } }
    await expect(getJourneyCover(J)).rejects.toMatchObject({
      code: 'read_failed',
    })
  })
})
