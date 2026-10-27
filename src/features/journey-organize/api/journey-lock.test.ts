import { describe, expect, it } from 'vitest'
import {
  JOURNEY_LOCK_PREFIX,
  withJourneyLock,
} from '@/features/journey-organize/api/journey-lock'

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('withJourneyLock', () => {
  it('runs the tasks of one journey one after another (in-process)', async () => {
    const order: string[] = []
    const gate = deferred()
    const first = withJourneyLock(
      'j',
      async () => {
        order.push('a:start')
        await gate.promise
        order.push('a:end')
        return 'a'
      },
      null,
    )
    const second = withJourneyLock(
      'j',
      () => {
        order.push('b')
        return Promise.resolve('b')
      },
      null,
    )
    const other = withJourneyLock(
      'k',
      () => {
        order.push('k')
        return Promise.resolve('k')
      },
      null,
    )
    await other
    gate.resolve()
    expect(await first).toBe('a')
    expect(await second).toBe('b')
    expect(order).toEqual(['a:start', 'k', 'a:end', 'b'])
  })

  it('a failed task does not block the next one', async () => {
    await expect(
      withJourneyLock('j', () => Promise.reject(new Error('x')), null),
    ).rejects.toThrow('x')
    expect(await withJourneyLock('j', () => Promise.resolve(1), null)).toBe(1)
  })

  it('holds the named Web Lock across tabs when available', async () => {
    const names: string[] = []
    const request = <T>(name: string, task: () => Promise<T>) => {
      names.push(name)
      return task()
    }
    expect(
      await withJourneyLock('j', () => Promise.resolve(2), { request }),
    ).toBe(2)
    expect(names).toEqual([`${JOURNEY_LOCK_PREFIX}j`])
  })
})
