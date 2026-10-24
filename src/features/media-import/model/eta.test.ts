import { describe, expect, it } from 'vitest'
import { estimateMinutesLeft } from '@/features/media-import/model/eta'

describe('estimateMinutesLeft', () => {
  it('hides the estimate until three jobs are finished', () => {
    expect(
      estimateMinutesLeft({
        elapsedMs: 20_000,
        finishedSinceStart: 2,
        remaining: 50,
      }),
    ).toBeNull()
  })

  it('rounds the mean time per job times the remaining jobs up to minutes', () => {
    // 10 s per job, 20 left = 200 s -> 4 minutes
    expect(
      estimateMinutesLeft({
        elapsedMs: 30_000,
        finishedSinceStart: 3,
        remaining: 20,
      }),
    ).toBe(4)
  })

  it('never says zero minutes and is null when nothing is left', () => {
    expect(
      estimateMinutesLeft({
        elapsedMs: 3_000,
        finishedSinceStart: 3,
        remaining: 1,
      }),
    ).toBe(1)
    expect(
      estimateMinutesLeft({
        elapsedMs: 3_000,
        finishedSinceStart: 3,
        remaining: 0,
      }),
    ).toBeNull()
  })
})
