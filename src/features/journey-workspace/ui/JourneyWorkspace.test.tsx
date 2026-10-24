import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react'
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
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'

const navigate = vi.hoisted(() => vi.fn())
const scrollIntoView = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', async () => {
  const { MockLink } = await import('@/features/journey-workspace/test-router')
  return { Link: MockLink, useNavigate: () => navigate }
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
    focus: { numbers: ReadonlyMap<string, number> }
    onSelect: (id: string) => void
    pins: { id: string }[]
  }) => (
    <div data-focus={props.focus.numbers.size} data-testid="map">
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

function render(ui: ReactElement) {
  return rtlRender(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  )
}

const T = (day: string, hhmm = '10:00') => `2026-01-${day}T${hhmm}:00+00:00`

function loadJourney(backlog = true) {
  const alpha = seg(1, {
    endsAt: T('05', '00:00'),
    startsAt: T('01', '00:00'),
    title: 'Alpha',
  })
  const beta = seg(2, {
    endsAt: T('09', '00:00'),
    origin: 'suggested',
    startsAt: T('05', '12:00'),
    title: 'Beta',
  })
  const moments = [
    mom(10, {
      body: 'A lovely day',
      latitude: 46.5,
      longitude: 8.1,
      placeId: 'place-1',
      startsAt: T('02'),
    }),
    mom(11, { latitude: 47, longitude: 9, startsAt: T('03') }),
    mom(12, { startsAt: T('06') }),
  ]
  const photo = (n: number, momentId: string, over = {}) =>
    med(n, {
      capturedAt: T('02'),
      momentId,
      variants: [variant(med(n).id, 'thumb')],
      ...over,
    })
  state = {
    status: 'ready',
    tree: buildWorkspaceTree([alpha, beta], moments, [
      photo(20, moments[0]?.id ?? '', backlog ? { reviewedAt: null } : {}),
      photo(21, moments[0]?.id ?? ''),
      photo(22, moments[1]?.id ?? '', { capturedAt: null }),
      med(23, { capturedAt: null, ...(backlog ? { reviewedAt: null } : {}) }),
    ]),
  }
}

describe('JourneyWorkspace overview', () => {
  beforeEach(async () => {
    scrollIntoView.mockReset()
    Element.prototype.scrollIntoView = scrollIntoView
    navigate.mockReset()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  function wide() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      addEventListener: vi.fn(),
      matches: true,
      media: query,
      removeEventListener: vi.fn(),
    }))
  }

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
      screen.getByText('This journey has no stages, stops or media yet.'),
    ).toBeTruthy()
  })

  it('shows the task bar with counts computed from the data', () => {
    loadJourney()
    render(<JourneyWorkspace journeyId="j" />)
    const bar = screen.getByRole('list', { name: 'What needs doing' })
    const chip = (task: string) =>
      bar.querySelector<HTMLElement>(`[data-task="${task}"]`)
    // Beta is a suggestion; of the 3 days only 2 Jan has text; 2 media lack
    // a capture time; nobody has 15 photos.
    expect(chip('suggestions')?.textContent).toContain('1')
    expect(chip('noText')?.textContent).toMatch(/^2/)
    expect(chip('toCull')?.textContent).toMatch(/^0/)
    expect(chip('toCull')?.dataset.done).toBe('true')
    expect(chip('noTime')?.textContent).toMatch(/^2/)
    expect(chip('noText')?.dataset.done).toBeUndefined()
    // Photo 20 (in a day) and 23 (unassigned) are unreviewed; the rest have
    // no reviewedAt at all, which counts as reviewed.
    expect(bar.querySelector('[data-task]')?.getAttribute('data-task')).toBe(
      'unreviewed',
    )
    expect(chip('unreviewed')?.textContent).toMatch(/^2/)
  })

  it('hides the sort chip as done when nothing is unreviewed', () => {
    loadJourney(false)
    render(<JourneyWorkspace journeyId="j" />)
    const chip = document.querySelector<HTMLElement>('[data-task="unreviewed"]')
    expect(chip?.dataset.done).toBe('true')
    expect(chip?.hasAttribute('disabled')).toBe(true)
  })

  it('opens the batch sorter from the sort chip', () => {
    loadJourney()
    navigate.mockClear()
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: /Sort/ }))
    expect(navigate).toHaveBeenCalledWith({
      params: { journeyId: 'j' },
      to: '/j/$journeyId/batch',
    })
  })

  it('opens the first day without text from its chip', () => {
    loadJourney()
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(
      screen.getByRole('button', { name: /Days without a few words/ }),
    )
    expect(navigate).toHaveBeenCalledWith({
      params: { date: '2026-01-03', journeyId: 'j' },
      search: {},
      to: '/j/$journeyId/workspace/day/$date',
    })
  })

  it('counts a day note as text: badge, progress and the task chip', () => {
    wide()
    loadJourney()
    dayNotes.byDate = new Map([['2026-01-03', 'We walked.']])
    try {
      render(<JourneyWorkspace journeyId="j" />)
      expect(
        screen
          .getByRole('list', { name: 'What needs doing' })
          .querySelector('[data-task="noText"]')?.textContent,
      ).toMatch(/^1/)
      const rail = screen.getByRole('navigation', { name: 'Stages' })
      const alpha = within(rail).getByRole('button', { name: /Alpha/ })
      expect(within(alpha).getByRole('img').getAttribute('aria-label')).toBe(
        '100 % done',
      )
      const card = document.querySelector('[data-day-card="2026-01-03"]')
      expect(within(card as HTMLElement).getByText('Note')).toBeTruthy()
      // 1 of 2 days of Alpha is done: photos sorted plus a note.
      expect(within(alpha).getByTestId('rail-progress').textContent).toBe(
        '1 of 2',
      )
    } finally {
      dayNotes.byDate = new Map()
    }
  })

  it('shows "done" on a stage whose days are all done', () => {
    wide()
    loadJourney(false)
    dayNotes.byDate = new Map([
      ['2026-01-02', 'a'],
      ['2026-01-03', 'b'],
    ])
    try {
      render(<JourneyWorkspace journeyId="j" />)
      const rail = screen.getByRole('navigation', { name: 'Stages' })
      const alpha = within(rail).getByRole('button', { name: /Alpha/ })
      expect(within(alpha).getByTestId('rail-progress').textContent).toBe(
        'done',
      )
      expect(within(alpha).getByLabelText('All days done')).toBeTruthy()
    } finally {
      dayNotes.byDate = new Map()
    }
  })

  it('opens the best-of chip straight in culling mode', () => {
    loadJourney()
    // 15 photos on 3 Jan and no star: that day wants a best-of pass.
    const tree = state.status === 'ready' ? state.tree : null
    const moment = tree?.roots[0]?.moments[1]?.moment
    state = {
      status: 'ready',
      tree: buildWorkspaceTree(
        tree?.roots.map((r) => r.segment) ?? [],
        [...(tree?.roots.flatMap((r) => r.moments.map((m) => m.moment)) ?? [])],
        Array.from({ length: 15 }, (_, i) =>
          med(300 + i, { capturedAt: T('03'), momentId: moment?.id ?? null }),
        ),
      ),
    }
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(
      screen.getByRole('button', { name: /Days to pick the best photos/ }),
    )
    expect(navigate).toHaveBeenCalledWith({
      params: { date: '2026-01-03', journeyId: 'j' },
      search: { cull: true },
      to: '/j/$journeyId/workspace/day/$date',
    })
  })

  it('remembers the scroll position when a day opens and restores it on return', () => {
    loadJourney()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 })
    const first = render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(document.querySelector('[data-day-card="2026-01-03"]')!)
    first.unmount()
    scrollTo.mockClear()
    render(<JourneyWorkspace journeyId="j" />)
    expect(scrollTo).toHaveBeenCalledWith(0, 420)
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  it('scrolls to the first suggestion and focuses its Accept button', () => {
    loadJourney()
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: /Suggested layouts/ }))
    expect(scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement?.textContent).toBe('Accept')
  })

  it('renders day cards: date, day number, places, photos and text badge', () => {
    loadJourney()
    render(<JourneyWorkspace journeyId="j" />)
    const alpha = screen.getByRole('region', { name: 'Alpha' })
    const cards = alpha.querySelectorAll<HTMLAnchorElement>('[data-day-card]')
    expect(cards).toHaveLength(2)
    const first = cards[0]
    expect(first?.getAttribute('href')).toBe('/j/j/workspace/day/2026-01-02')
    const card = within(first as HTMLElement)
    expect(card.getByText('Fri 2 Jan')).toBeTruthy()
    expect(card.getByText('Day 1')).toBeTruthy()
    expect(card.getByText('2 photos')).toBeTruthy()
    expect(card.getByText('1 left')).toBeTruthy()
    expect(card.getByText('No note')).toBeTruthy()
    expect(card.queryByText('Sorted')).toBeNull()
    const second = within(cards[1] as HTMLElement)
    expect(second.getByText('Sorted')).toBeTruthy()
    expect(second.getByText('No note')).toBeTruthy()
    // Overview shows no moment cards and no inline photo rows any more.
    expect(screen.queryByTestId('moment-rail')).toBeNull()
    expect(within(alpha).queryByTestId('editable-media-tile')).toBeNull()
  })

  it('lists the stages in order and styles the suggestion', () => {
    loadJourney()
    render(<JourneyWorkspace journeyId="j" />)
    const alpha = screen.getByRole('region', { name: 'Alpha' })
    const beta = screen.getByRole('region', { name: 'Beta' })
    const after = Node.DOCUMENT_POSITION_FOLLOWING
    expect(alpha.compareDocumentPosition(beta) & after).toBeTruthy()
    expect(within(beta).getByText(/Automatic suggestion/)).toBeTruthy()
    expect(within(beta).getByRole('button', { name: 'Accept' })).toBeTruthy()
    expect(screen.getByTestId('unassigned-group')).toBeTruthy()
  })

  it('on narrow screens lists stages as chips and hides the map behind a toggle', () => {
    loadJourney()
    render(<JourneyWorkspace journeyId="j" />)
    const chips = screen.getByRole('navigation', { name: 'Stages' })
    expect(within(chips).getByRole('button', { name: /Alpha/ })).toBeTruthy()
    expect(within(chips).getByText('new')).toBeTruthy()
    expect(screen.queryByTestId('map')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Map' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByTestId('map')).toBeTruthy()
  })

  it('on wide screens shows the stage rail with progress, the day strip and the map', () => {
    wide()
    loadJourney()
    render(<JourneyWorkspace journeyId="j" />)
    const rail = screen.getByRole('navigation', { name: 'Stages' })
    const alpha = within(rail).getByRole('button', { name: /Alpha/ })
    // 1 of 2 days has text.
    expect(within(alpha).getByRole('img').getAttribute('aria-label')).toBe(
      '50 % done',
    )
    const beta = within(rail).getByRole('button', { name: /Beta/ })
    expect(within(beta).getByText('new')).toBeTruthy()
    expect(within(rail).queryByRole('img', { name: /done/ })).not.toBeNull()
    expect(screen.getByTestId('day-strip').children).toHaveLength(3)
    expect(screen.getByTestId('map')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Map' })).toBeNull()
    fireEvent.click(alpha)
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('lights up the hovered day on the map and opens a day from a pin', () => {
    wide()
    loadJourney()
    render(<JourneyWorkspace journeyId="j" />)
    const map = screen.getByTestId('map')
    expect(map.dataset.focus).toBe('0')
    const card = document.querySelector('[data-day-card="2026-01-02"]')
    fireEvent.mouseEnter(card!)
    expect(map.dataset.focus).toBe('1')
    fireEvent.mouseLeave(card!)
    expect(map.dataset.focus).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: 'pin-11' }))
    expect(navigate).toHaveBeenCalledWith({
      params: { date: '2026-01-03', journeyId: 'j' },
      search: {},
      to: '/j/$journeyId/workspace/day/$date',
    })
  })
})
