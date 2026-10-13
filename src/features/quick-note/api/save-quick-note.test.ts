import { describe, expect, it, vi } from 'vitest'
import { saveQuickNote } from '@/features/quick-note/api/save-quick-note'

const U = '22222222-2222-4222-8222-222222222222'
const J = '11111111-1111-4111-8111-111111111111'
const ID = '33333333-3333-4333-8333-333333333333'

function deps(over: Record<string, unknown> = {}) {
  return {
    createMoments: vi.fn<(rows: unknown[]) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    getPosition: vi.fn(() =>
      Promise.resolve({ latitude: 51.1, longitude: -115.2 }),
    ),
    newId: () => ID,
    now: () => new Date('2026-06-01T10:00:00.000Z'),
    ...over,
  }
}
const input = {
  journeyId: J,
  text: '  Medvěd!  ',
  useLocation: true,
  userId: U,
}

describe('saveQuickNote', () => {
  it('creates a locked manual moment at the current instant with the position', async () => {
    const d = deps()
    expect(await saveQuickNote(input, d)).toEqual({ located: true, ok: true })
    expect(d.createMoments).toHaveBeenCalledWith([
      {
        body: 'Medvěd!',
        createdBy: U,
        endsAt: '2026-06-01T10:00:00.000Z',
        id: ID,
        journeyId: J,
        latitude: 51.1,
        locked: true,
        longitude: -115.2,
        origin: 'manual',
        startsAt: '2026-06-01T10:00:00.000Z',
      },
    ])
  })

  it('still saves without coordinates when locating fails or is off', async () => {
    const failing = deps({
      getPosition: vi.fn(() => Promise.reject(new Error('denied'))),
    })
    expect(await saveQuickNote(input, failing)).toEqual({
      located: false,
      ok: true,
    })
    expect(failing.createMoments.mock.calls[0]?.[0]?.[0]).toMatchObject({
      latitude: null,
      longitude: null,
    })
    const off = deps()
    await saveQuickNote({ ...input, useLocation: false }, off)
    expect(off.getPosition).not.toHaveBeenCalled()
  })

  it('rejects empty and over-long notes without touching the database', async () => {
    const d = deps()
    expect(await saveQuickNote({ ...input, text: ' \n ' }, d)).toEqual({
      ok: false,
      reason: 'empty',
    })
    expect(
      await saveQuickNote({ ...input, text: 'x'.repeat(100_001) }, d),
    ).toEqual({ ok: false, reason: 'too_long' })
    expect(d.createMoments).not.toHaveBeenCalled()
  })

  it('reports a failed save', async () => {
    const d = deps({
      createMoments: vi.fn(() => Promise.reject(new Error('offline'))),
    })
    expect(await saveQuickNote(input, d)).toEqual({
      ok: false,
      reason: 'save_failed',
    })
  })
})
