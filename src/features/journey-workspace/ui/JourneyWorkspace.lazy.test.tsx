import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render as rtlRender } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { JourneyWorkspaceState } from '@/features/journey-workspace/api/use-journey-workspace'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import {
  med,
  mom,
  seg,
  variant,
} from '@/features/journey-workspace/test-fixtures'
import { ToastProvider } from '@/shared/ui/ToastProvider'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'

vi.mock('@tanstack/react-router', async () => {
  const { MockLink } = await import('@/features/journey-workspace/test-router')
  return { Link: MockLink, useNavigate: () => vi.fn() }
})
const dayNotes = vi.hoisted(() => ({ byDate: new Map<string, string>() }))
vi.mock('@/entities/day-note/api/use-day-notes', () => ({
  useDayNotes: () => ({ byDate: dayNotes.byDate, save: vi.fn() }),
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
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
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

describe('JourneyWorkspace lazy moments (1 200 media fixture)', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('the overview of the same journey stays light: three pictures per day, no moment blocks', () => {
    bigJourney()
    render(<JourneyWorkspace journeyId="j" />)
    expect(blockCount()).toBe(0)
    const cards = document.querySelectorAll('[data-day-card]')
    expect(cards).toHaveLength(1)
    expect(cards[0]?.querySelectorAll('img')).toHaveLength(3)
    // Cards plus the stage cover in the chip strip: nothing close to 1 200.
    expect(imgCount()).toBeLessThanOrEqual(4)
  })
})
