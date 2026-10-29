import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Moment } from '@/entities/moment/model/moment'
import { mom } from '@/features/journey-workspace/test-fixtures'
import { useResolveMissingPlaces } from './use-resolve-missing-places'

interface Call {
  finish: () => void
  ids: string[]
  stopped: () => boolean
}
const calls = vi.hoisted(() => [] as Call[])

vi.mock('@/features/journey-workspace/api/resolve-places', () => ({
  needsPlace: (m: Moment) =>
    m.placeId === null && m.latitude !== null && m.longitude !== null,
  resolveMissingPlaces: (
    todo: Moment[],
    deps: { stopped: () => boolean },
  ): Promise<unknown> =>
    new Promise((resolve) => {
      calls.push({
        finish: () => {
          resolve({ attempted: [], gaveUp: false, named: 0 })
        },
        ids: todo.map((m) => m.id),
        stopped: deps.stopped,
      })
    }),
}))

const client = new QueryClient()
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const a = mom(1, { latitude: 51, longitude: -115 })
const b = mom(2, { latitude: 52, longitude: -116 })

describe('useResolveMissingPlaces', () => {
  it('cancels the old run on a journey switch or when disabled, not on a moments update', async () => {
    calls.length = 0
    const { rerender } = renderHook(
      (props: { enabled: boolean; journey: string; moments: Moment[] }) =>
        useResolveMissingPlaces(props.journey, props.moments, props.enabled),
      { initialProps: { enabled: true, journey: 'j1', moments: [a] }, wrapper },
    )
    expect(calls.map((c) => c.ids)).toEqual([[a.id]])
    // a moments update of the same journey keeps the run going
    rerender({ enabled: true, journey: 'j1', moments: [a, b] })
    expect(calls[0]?.stopped()).toBe(false)
    expect(calls).toHaveLength(1)
    // after the run the new stop is picked up
    await act(async () => {
      calls[0]?.finish()
      await Promise.resolve()
    })
    expect(calls.map((c) => c.ids)).toEqual([[a.id], [b.id]])
    // switching the journey cancels the running lookup and starts afresh
    rerender({ enabled: true, journey: 'j2', moments: [a] })
    expect(calls[1]?.stopped()).toBe(true)
    expect(calls[2]?.ids).toEqual([a.id])
    // disabling cancels too
    rerender({ enabled: false, journey: 'j2', moments: [a] })
    expect(calls[2]?.stopped()).toBe(true)
    expect(calls).toHaveLength(3)
  })
})
