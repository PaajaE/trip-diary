import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
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
  variant,
} from '@/features/journey-workspace/test-fixtures'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'

// The header links to the import page; no router is mounted in these tests.
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

function render(ui: ReactElement) {
  return rtlRender(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  )
}

let state: JourneyWorkspaceState = { status: 'loading' }
vi.mock('@/features/journey-workspace/api/use-journey-workspace', () => ({
  useJourneyWorkspace: () => state,
}))
vi.mock('@/features/journey-workspace/ui/WorkspaceMap', () => ({
  WorkspaceMap: (props: {
    pins: { id: string }[]
    selectedId: string | null
    onSelect: (id: string) => void
  }) => (
    <div data-selected={props.selectedId ?? ''} data-testid="map">
      {props.pins.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            props.onSelect(p.id)
          }}
        >
          pin-{p.id.slice(-2)}
        </button>
      ))}
    </div>
  ),
}))

function readyWith(moments: ReturnType<typeof mom>[]) {
  const stage = seg(1)
  const trip = seg(2, { kind: 'trip', parentId: stage.id })
  const m = moments
  const photo = med(20, {
    momentId: m[0]?.id ?? null,
    variants: [variant(med(20).id, 'thumb')],
  })
  const video = med(21, {
    durationMs: 65_000,
    kind: 'video',
    momentId: m[0]?.id ?? null,
    variants: [variant(med(21).id, 'poster')],
  })
  const orphan = med(22)
  state = {
    status: 'ready',
    tree: buildWorkspaceTree([stage, trip], m, [photo, video, orphan]),
  }
}

describe('JourneyWorkspace', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
  })

  it('shows a skeleton while loading', () => {
    state = { status: 'loading' }
    render(<JourneyWorkspace journeyId="j" />)
    expect(screen.getByTestId('workspace-skeleton')).toBeTruthy()
  })

  it('shows an error with retry', () => {
    const retry = vi.fn()
    state = { retry, status: 'error' }
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('shows an empty-journey message', () => {
    state = { status: 'ready', tree: buildWorkspaceTree([], [], []) }
    render(<JourneyWorkspace journeyId="j" />)
    expect(
      screen.getByText('This journey has no stages, moments or media yet.'),
    ).toBeTruthy()
  })

  it('renders the hierarchy, unassigned group, counts and untitled moment time', () => {
    readyWith([mom(10, { latitude: 46.5, longitude: 8.1 })])
    render(<JourneyWorkspace journeyId="j" />)
    expect(screen.getByText('Segment 1')).toBeTruthy()
    expect(screen.getByText('Segment 2')).toBeTruthy()
    // 10:00 UTC rendered in Europe/Prague (UTC+1 in January).
    expect(screen.getByText(/Moment at 11:00/)).toBeTruthy()
    expect(screen.getAllByText(/1 photo/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/1 video/).length).toBeGreaterThan(0)
    expect(screen.getByText('1:05')).toBeTruthy()
    expect(screen.getByTestId('unassigned-group')).toBeTruthy()
  })

  it('syncs selection between list and map', () => {
    readyWith([mom(10, { latitude: 46.5, longitude: 8.1 })])
    render(<JourneyWorkspace journeyId="j" />)
    const map = screen.getByTestId('map')
    expect(map.dataset.selected).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /^Moment at 11:00/ }))
    expect(map.dataset.selected).toMatch(/10$/)
    fireEvent.click(screen.getByRole('button', { name: 'pin-10' }))
    expect(map.dataset.selected).toMatch(/10$/)
  })

  it('shows an empty-state instead of the map when no moment has coordinates', () => {
    readyWith([mom(10)])
    render(<JourneyWorkspace journeyId="j" />)
    expect(screen.queryByTestId('map')).toBeNull()
    expect(screen.getByText(/nothing to show on the map/)).toBeTruthy()
  })

  it('on wide screens shows the outline; clicking a moment re-opens its stage and scrolls', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      addEventListener: vi.fn(),
      matches: true,
      media: query,
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn()
        disconnect = vi.fn()
      },
    )
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      readyWith([mom(10, { latitude: 46.5, longitude: 8.1 })])
      render(<JourneyWorkspace journeyId="j" />)
      const outline = screen.getByRole('navigation', { name: 'Outline' })
      fireEvent.click(
        screen.getByRole('button', { name: 'Collapse: Segment 1' }),
      )
      expect(
        screen.getByRole('button', { name: 'Expand: Segment 1' }),
      ).toBeTruthy()
      fireEvent.click(within(outline).getByRole('button', { name: /^11:00/ }))
      expect(
        screen.getByRole('button', { name: 'Collapse: Segment 1' }),
      ).toBeTruthy()
      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled()
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
