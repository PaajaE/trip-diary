import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteDayNote,
  saveDayNote,
} from '@/entities/day-note/api/day-note.repository'
import { DayNoteError } from '@/entities/day-note/model/day-note'

const ID = '11111111-1111-4111-8111-111111111111'
const J = '22222222-2222-4222-8222-222222222222'
const row = {
  body: 'Text',
  created_at: '2026-01-01T10:00:00+00:00',
  created_by: null,
  id: ID,
  journey_id: J,
  local_date: '2026-06-03',
  updated_at: '2026-01-01T10:00:00+00:00',
}

let results: { data: unknown; error: unknown }[] = []
const calls: string[] = []
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'single',
  'maybeSingle',
]) {
  chain[name] = vi.fn((...args: unknown[]) => {
    calls.push(`${name}:${JSON.stringify(args)}`)
    return Object.assign(
      {
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve(results.shift() ?? { data: null, error: null }).then(
            resolve,
            reject,
          ),
      },
      chain,
    )
  })
}
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from: () => chain }),
}))
vi.mock('@/shared/api/current-user', () => ({
  getCurrentUserId: () => Promise.resolve('user-1'),
}))

beforeEach(() => {
  results = []
  calls.length = 0
})

describe('day note repository', () => {
  it('updates an existing note without inserting', async () => {
    results = [{ data: row, error: null }]
    const note = await saveDayNote(J, '2026-06-03', '  Text ')
    expect(note.localDate).toBe('2026-06-03')
    expect(calls).toContain('update:[{"body":"Text"}]')
    expect(calls.some((c) => c.startsWith('insert'))).toBe(false)
  })

  it('inserts when the day has no note yet, with created_by', async () => {
    results = [
      { data: null, error: null },
      { data: row, error: null },
    ]
    await saveDayNote(J, '2026-06-03', 'Text')
    expect(calls.find((c) => c.startsWith('insert'))).toBe(
      `insert:[{"body":"Text","created_by":"user-1","journey_id":"${J}","local_date":"2026-06-03"}]`,
    )
  })

  it('rejects empty and over-long text before any request', async () => {
    await expect(saveDayNote(J, '2026-06-03', '  ')).rejects.toBeInstanceOf(
      DayNoteError,
    )
    await expect(
      saveDayNote(J, '2026-06-03', 'x'.repeat(20_001)),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(calls).toHaveLength(0)
  })

  it('maps permission errors and deletes by journey and date', async () => {
    results = [{ data: null, error: { code: '42501', message: 'no' } }]
    await expect(deleteDayNote(J, '2026-06-03')).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect(calls).toContain('delete:[]')
  })
})
