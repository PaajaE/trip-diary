import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
} from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { JourneyWorkspaceState } from '@/features/journey-workspace/api/use-journey-workspace'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import {
  med,
  mom,
  seg,
  uuid,
  variant,
} from '@/features/journey-workspace/test-fixtures'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/import">{children}</a>
  ),
}))
vi.mock('@/features/moment-tags/api/use-moment-tags', () => ({
  useJourneyMomentTags: () => ({
    byMoment: new Map(),
    catalog: [],
    edits: { addFree: vi.fn(), addSpecies: vi.fn(), toggle: vi.fn() },
    loadFailed: false,
  }),
}))
vi.mock('@/entities/journey/api/use-journey-cover-query', () => ({
  useJourneyCoverQuery: () => ({ data: null }),
}))
const canEditState = vi.hoisted(() => ({ canEdit: true, ready: true }))
vi.mock('@/features/journey-workspace/api/use-can-edit-journey', () => ({
  useCanEditJourney: () => canEditState,
}))
vi.mock('@/features/journey-workspace/api/use-workspace-edits', () => ({
  useWorkspaceEdits: () => ({
    saveCaption: vi.fn(),
    setCover: vi.fn(),
    toggleStar: vi.fn(),
  }),
}))
let state: JourneyWorkspaceState = { status: 'loading' }
vi.mock('@/features/journey-workspace/api/use-journey-workspace', () => ({
  useJourneyWorkspace: () => state,
}))
vi.mock('@/features/journey-workspace/ui/WorkspaceMap', () => ({
  WorkspaceMap: (props: {
    pins: { id: string }[]
    onSelect: (id: string) => void
  }) => (
    <div data-testid="map">
      {props.pins.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            props.onSelect(p.id)
          }}
        >
          pin-{p.id.slice(-3)}
        </button>
      ))}
    </div>
  ),
}))

function render(ui: ReactElement) {
  return rtlRender(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  )
}

const MOMENTS = 120
const PER_MOMENT = 10

/** One stage, 120 moments with coordinates and 10 photos each (1 200 media). */
function bigJourney() {
  const stage = seg(1)
  const moments = Array.from({ length: MOMENTS }, (_, i) =>
    mom(1000 + i, {
      latitude: 45 + i / 100,
      longitude: 8 + i / 100,
      startsAt: `2026-01-02T${String(Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}:00+00:00`,
    }),
  )
  const media = moments.flatMap((m, i) =>
    Array.from({ length: PER_MOMENT }, (_, k) => {
      const base = med(100_000 + i * PER_MOMENT + k)
      return {
        ...base,
        momentId: m.id,
        variants: [variant(base.id, 'thumb')],
      }
    }),
  )
  state = {
    status: 'ready',
    tree: buildWorkspaceTree([stage], moments, media),
  }
  return { moments, stage }
}

const imgCount = () => document.querySelectorAll('img').length
const blockCount = () =>
  document.querySelectorAll('li[id^="ws-moment-"]:not([data-placeholder])')
    .length

/** IntersectionObserver that never reports anything as near the viewport. */
class NeverNear {
  observe = vi.fn()
  disconnect = vi.fn()
}

/** Reports the first `limit` observed elements as near, the rest not. */
function nearFirst(limit: number) {
  let seen = 0
  return class {
    cb: (e: { isIntersecting: boolean }[]) => void
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
      this.cb = cb
    }
    observe() {
      seen += 1
      if (seen <= limit) this.cb([{ isIntersecting: true }])
    }
    disconnect = vi.fn()
  }
}

describe('JourneyWorkspace lazy moments (1 200 media fixture)', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('before: without an observer every moment renders all its tiles', () => {
    bigJourney()
    render(<JourneyWorkspace journeyId="j" />)
    expect(blockCount()).toBe(MOMENTS)
    // GRID_LIMIT 6: five thumbs plus the "+N" tile per moment.
    expect(imgCount()).toBeGreaterThanOrEqual(MOMENTS * 5)
    console.info(
      `[perf] no lazy rendering: ${String(blockCount())} blocks, ${String(imgCount())} img`,
    )
  })

  it('after: only moments near the viewport render; others are placeholders with ids', () => {
    vi.stubGlobal('IntersectionObserver', nearFirst(8))
    const { moments } = bigJourney()
    render(<JourneyWorkspace journeyId="j" />)
    expect(blockCount()).toBe(8)
    expect(imgCount()).toBeLessThanOrEqual(8 * 5 + 2)
    console.info(
      `[perf] lazy rendering: ${String(blockCount())} blocks, ${String(imgCount())} img of ${String(MOMENTS)} moments`,
    )
    const last = moments[MOMENTS - 1]
    const placeholder = document.getElementById(`ws-moment-${last?.id ?? ''}`)
    expect(placeholder?.dataset.placeholder).toBe('true')
    expect(placeholder?.style.minHeight).not.toBe('')
  })

  it('a pin click opens the collapsed stage, renders the moment and scrolls to it', () => {
    vi.stubGlobal('IntersectionObserver', NeverNear)
    vi.useFakeTimers()
    try {
      const { moments } = bigJourney()
      const scroll = vi.fn()
      Element.prototype.scrollIntoView = scroll
      render(<JourneyWorkspace journeyId="j" />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Collapse: Segment 1' }),
      )
      expect(document.getElementById(`ws-moment-${uuid(1100)}`)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'pin-100' }))
      expect(
        screen.getByRole('button', { name: 'Collapse: Segment 1' }),
      ).toBeTruthy()
      const target = document.getElementById(
        `ws-moment-${moments[100]?.id ?? ''}`,
      )
      // The selected moment renders even though it is far from the viewport.
      expect(target?.dataset.placeholder).toBeUndefined()
      vi.runAllTimers()
      expect(scroll).toHaveBeenCalled()
      expect(scroll.mock.contexts.some((el: unknown) => el === target)).toBe(
        true,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('an outline jump renders the target and two neighbours each side, then re-checks intersection', () => {
    const observed = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observed
        disconnect = vi.fn()
      },
    )
    vi.useFakeTimers()
    try {
      const { moments } = bigJourney()
      render(<JourneyWorkspace journeyId="j" />)
      expect(blockCount()).toBe(0)
      fireEvent.click(screen.getByRole('button', { name: 'pin-100' }))
      act(() => {
        vi.advanceTimersByTime(0)
      })
      const rendered = moments
        .map((m, i) => ({
          i,
          real:
            document.getElementById(`ws-moment-${m.id}`)?.dataset
              .placeholder === undefined,
        }))
        .filter((m) => m.real)
        .map((m) => m.i)
      expect(rendered).toEqual([98, 99, 100, 101, 102])
      const before = observed.mock.calls.length
      // No scrollend event: the timeout fallback finishes the navigation.
      act(() => {
        vi.advanceTimersByTime(1300)
      })
      expect(observed.mock.calls.length).toBeGreaterThan(before)
      // Rendered blocks stay rendered after the force is dropped.
      expect(blockCount()).toBe(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a scrollend event ends the navigation without waiting for the timeout', () => {
    const observed = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observed
        disconnect = vi.fn()
      },
    )
    vi.useFakeTimers()
    try {
      bigJourney()
      render(<JourneyWorkspace journeyId="j" />)
      fireEvent.click(screen.getByRole('button', { name: 'pin-100' }))
      act(() => {
        vi.advanceTimersByTime(0)
      })
      const before = observed.mock.calls.length
      act(() => {
        window.dispatchEvent(new Event('scrollend'))
      })
      expect(observed.mock.calls.length).toBeGreaterThan(before)
    } finally {
      vi.useRealTimers()
    }
  })
})
