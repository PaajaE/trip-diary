import { describe, expect, it, vi } from 'vitest'
import {
  revertOf,
  starOverrides,
  writeOf,
  type SortWriteActions,
} from '@/features/journey-flow/ui/day-sort-writes'

function fakes() {
  const calls: string[] = []
  const actions = {
    restorePhotos: vi.fn(() => {
      calls.push('restore')
      return Promise.resolve(1)
    }),
    sortPhotos: vi.fn((_ids: readonly string[], sorted = true) => {
      calls.push(sorted ? 'sort' : 'unsort')
      return Promise.resolve(1)
    }),
    starPhotos: vi.fn((_ids: readonly string[], on: boolean) => {
      calls.push(on ? 'star' : 'unstar')
      return Promise.resolve()
    }),
    trashPhotos: vi.fn(() => {
      calls.push('trash')
      return Promise.resolve(1)
    }),
  } satisfies SortWriteActions
  return { actions, calls }
}

describe('day sort writes', () => {
  it('"★ Nejlepší" is one step; a failed keep takes the ★ back', async () => {
    const { actions, calls } = fakes()
    await writeOf({ ids: ['a'], starred: true, type: 'best' }, actions)
    expect(calls).toEqual(['star', 'sort'])
    calls.length = 0
    actions.sortPhotos.mockRejectedValueOnce(new Error('x'))
    await expect(
      writeOf({ ids: ['a'], starred: true, type: 'best' }, actions),
    ).rejects.toThrow('x')
    expect(calls).toEqual(['star', 'unstar'])
  })

  it('trash of a ★ photo takes the ★ off first and back on when trash fails', async () => {
    const { actions, calls } = fakes()
    await writeOf({ ids: ['a'], starred: true, type: 'trash' }, actions)
    expect(calls).toEqual(['unstar', 'trash'])
    calls.length = 0
    actions.trashPhotos.mockRejectedValueOnce(new Error('x'))
    await expect(
      writeOf({ ids: ['a'], starred: true, type: 'trash' }, actions),
    ).rejects.toThrow('x')
    expect(calls).toEqual(['unstar', 'star'])
  })

  it('reverts each step', async () => {
    const { actions, calls } = fakes()
    await revertOf({ ids: ['a'], starred: true, type: 'trash' }, actions)
    await revertOf({ ids: ['a'], starred: true, type: 'best' }, actions)
    await revertOf({ ids: ['a'], type: 'done' }, actions)
    await revertOf({ ids: ['a'], type: 'star' }, actions)
    expect(calls).toEqual([
      'restore',
      'star',
      'unsort',
      'unstar',
      'unsort',
      'unstar',
    ])
  })

  it('shows ★ as the steps left it (trash takes it off)', () => {
    const over = starOverrides([
      { ids: ['a'], starred: true, type: 'best' },
      { ids: ['b'], type: 'star' },
      { ids: ['b'], starred: true, type: 'trash' },
    ])
    expect(over.get('a')).toBe(true)
    expect(over.get('b')).toBe(false)
  })
})
