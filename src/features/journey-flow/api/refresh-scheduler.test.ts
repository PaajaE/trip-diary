import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRefreshScheduler,
  REFRESH_QUIET_MS,
} from '@/features/journey-flow/api/refresh-scheduler'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('refresh scheduler', () => {
  it('refreshes once after a quiet period, never per write or mid-flight', () => {
    const refresh = vi.fn(() => Promise.resolve())
    const s = createRefreshScheduler(refresh)
    s.begin()
    s.begin()
    s.end()
    vi.advanceTimersByTime(REFRESH_QUIET_MS * 2)
    expect(refresh).not.toHaveBeenCalled() // one write still in flight
    s.end()
    vi.advanceTimersByTime(REFRESH_QUIET_MS - 1)
    s.begin()
    s.end()
    vi.advanceTimersByTime(REFRESH_QUIET_MS - 1)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(REFRESH_QUIET_MS * 3)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('flush refreshes now when due, or as soon as the last write ends', () => {
    const refresh = vi.fn(() => Promise.resolve())
    const s = createRefreshScheduler(refresh)
    s.flush()
    expect(refresh).not.toHaveBeenCalled() // nothing written
    s.begin()
    s.flush()
    expect(refresh).not.toHaveBeenCalled()
    s.end()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a structural write refreshes now, or after the sorting writes in flight', async () => {
    const refresh = vi.fn(() => Promise.resolve())
    const s = createRefreshScheduler(refresh)
    await s.refreshNow()
    expect(refresh).toHaveBeenCalledTimes(1)
    s.begin()
    await s.refreshNow()
    expect(refresh).toHaveBeenCalledTimes(1)
    s.end()
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
