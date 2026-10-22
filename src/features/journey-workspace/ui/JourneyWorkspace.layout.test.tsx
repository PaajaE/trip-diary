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

function loadJourney() {
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
      photo(20, moments[0]?.id ?? ''),
      photo(21, moments[0]?.id ?? ''),
      photo(22, moments[1]?.id ?? '', { capturedAt: null }),
      med(23, { capturedAt: null }),
    ]),
  }
}

describe('JourneyWorkspace layout controls', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    navigate.mockReset()
    window.localStorage.clear()
    await i18n.changeLanguage('en')
    vi.stubGlobal('matchMedia', (query: string) => ({
      addEventListener: vi.fn(),
      matches: true,
      media: query,
      removeEventListener: vi.fn(),
    }))
    loadJourney()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('collapses and expands the stage rail with the button and "["', () => {
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse stages panel' }),
    )
    expect(screen.queryByTestId('day-strip')).toBeNull()
    // Collapsed thumbs jump to the stage and are named "title · dates".
    const thumb = screen.getByRole('button', { name: /^Alpha · / })
    fireEvent.click(thumb)
    fireEvent.keyDown(window, { key: '[' })
    expect(screen.getByTestId('day-strip')).toBeTruthy()
    expect(
      window.localStorage.getItem('trip-diary.workspace-layout'),
    ).toContain('"rail":"open"')
  })

  it('ignores the shortcut while typing or with a modifier', () => {
    render(<JourneyWorkspace journeyId="j" />)
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: '[' })
    fireEvent.keyDown(window, { ctrlKey: true, key: '[' })
    expect(screen.getByTestId('day-strip')).toBeTruthy()
    input.remove()
  })

  it('hides the map and brings it back with the Map button or "M"', () => {
    render(<JourneyWorkspace journeyId="j" />)
    expect(screen.getByRole('separator')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide map' }))
    expect(screen.queryByTestId('map')).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByTestId('map')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'm' })
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('resizes the map with the splitter keys', () => {
    render(<JourneyWorkspace journeyId="j" />)
    const splitter = screen.getByRole('separator')
    const before = Number(splitter.getAttribute('aria-valuenow'))
    fireEvent.keyDown(splitter, { key: 'ArrowLeft', shiftKey: true })
    expect(Number(splitter.getAttribute('aria-valuenow'))).toBeGreaterThan(
      before,
    )
  })

  it('shows the full map overlay and closes it with Esc', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <JourneyWorkspace fullMap journeyId="j" onFullMapChange={onChange} />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Journey map' })
    expect(within(dialog).getByTestId('map')).toBeTruthy()
    expect(
      within(dialog).getByRole('button', { name: 'Whole journey' }),
    ).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onChange).toHaveBeenCalledWith(false)
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <JourneyWorkspace
          fullMap={false}
          journeyId="j"
          onFullMapChange={onChange}
        />
      </QueryClientProvider>,
    )
  })

  it('opens the full map from the panel header', () => {
    const onChange = vi.fn()
    render(<JourneyWorkspace journeyId="j" onFullMapChange={onChange} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Map over the whole workspace' }),
    )
    expect(onChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('dialog', { name: 'Journey map' })).toBeTruthy()
  })
})
