import { describe, expect, it, vi } from 'vitest'
import { purgeTrashedMedia } from '@/features/journey-workspace/api/purge-trash'

const claimAll = (ids: string[]) => Promise.resolve(ids)

describe('purgeTrashedMedia', () => {
  it('claims first, then deletes R2 objects, then the database rows', async () => {
    const order: string[] = []
    const outcome = await purgeTrashedMedia(['a', 'b'], {
      claim: (ids) => {
        order.push(`claim:${ids.join(',')}`)
        return Promise.resolve(ids)
      },
      deleteObjects: (id) => {
        order.push(`r2:${id}`)
        return Promise.resolve()
      },
      purgeRows: (ids) => {
        order.push(`rows:${ids.join(',')}`)
        return Promise.resolve(ids)
      },
    })
    expect(order).toEqual(['claim:a,b', 'r2:a', 'r2:b', 'rows:a,b'])
    expect(outcome).toEqual({ failed: [], purged: ['a', 'b'], skipped: [] })
  })

  it('never touches R2 for ids the claim did not return (restore race)', async () => {
    const deleteObjects = vi.fn(() => Promise.resolve())
    const purgeRows = vi.fn((ids: string[]) => Promise.resolve(ids))
    const outcome = await purgeTrashedMedia(['a', 'b', 'c'], {
      claim: () => Promise.resolve(['b']),
      deleteObjects,
      purgeRows,
    })
    expect(deleteObjects).toHaveBeenCalledTimes(1)
    expect(deleteObjects).toHaveBeenCalledWith('b')
    expect(purgeRows).toHaveBeenCalledWith(['b'])
    expect(outcome).toEqual({ failed: [], purged: ['b'], skipped: ['a', 'c'] })
  })

  it('keeps an item whose R2 delete failed and never purges its row', async () => {
    const purgeRows = vi.fn((ids: string[]) => Promise.resolve(ids))
    const outcome = await purgeTrashedMedia(['a', 'b', 'c'], {
      claim: claimAll,
      deleteObjects: (id) =>
        id === 'b' ? Promise.reject(new Error('r2')) : Promise.resolve(),
      purgeRows,
    })
    expect(purgeRows).toHaveBeenCalledWith(['a', 'c'])
    expect(outcome).toEqual({ failed: ['b'], purged: ['a', 'c'], skipped: [] })
  })

  it('does not call purge_media when every R2 delete failed', async () => {
    const purgeRows = vi.fn()
    const outcome = await purgeTrashedMedia(['a'], {
      claim: claimAll,
      deleteObjects: () => Promise.reject(new Error('r2')),
      purgeRows,
    })
    expect(purgeRows).not.toHaveBeenCalled()
    expect(outcome).toEqual({ failed: ['a'], purged: [], skipped: [] })
  })

  it('does nothing when the claim itself fails', async () => {
    const deleteObjects = vi.fn()
    const outcome = await purgeTrashedMedia(['a'], {
      claim: () => Promise.reject(new Error('42501')),
      deleteObjects,
      purgeRows: vi.fn(),
    })
    expect(deleteObjects).not.toHaveBeenCalled()
    expect(outcome).toEqual({ failed: ['a'], purged: [], skipped: [] })
  })

  it('reports rows the database refused to purge as failed', async () => {
    const outcome = await purgeTrashedMedia(['a', 'b'], {
      claim: claimAll,
      deleteObjects: () => Promise.resolve(),
      purgeRows: () => Promise.resolve(['a']),
    })
    expect(outcome).toEqual({ failed: ['b'], purged: ['a'], skipped: [] })
    const thrown = await purgeTrashedMedia(['a'], {
      claim: claimAll,
      deleteObjects: () => Promise.resolve(),
      purgeRows: () => Promise.reject(new Error('x')),
    })
    expect(thrown).toEqual({ failed: ['a'], purged: [], skipped: [] })
  })
})
