import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { JourneyWorkspaceState } from '@/features/journey-workspace/api/use-journey-workspace'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg } from '@/features/journey-workspace/test-fixtures'
import { ToastProvider } from '@/shared/ui/ToastProvider'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'
import { JourneyWorkspaceDay } from '@/features/journey-workspace/ui/JourneyWorkspaceDay'

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
vi.mock('@/features/journey-workspace/api/use-can-edit-journey', () => ({
  useCanEditJourney: () => ({ canEdit: true, ready: true }),
}))
vi.mock('@/features/journey-workspace/api/use-workspace-edits', () => ({
  useWorkspaceEdits: () => ({
    saveCaption: vi.fn(),
    setCover: vi.fn(),
    toggleStar: vi.fn(),
    trashMedia: vi.fn(),
  }),
}))
let state: JourneyWorkspaceState = { status: 'loading' }
vi.mock('@/features/journey-workspace/api/use-journey-workspace', () => ({
  useJourneyWorkspace: () => state,
}))
vi.mock('@/features/journey-workspace/ui/WorkspaceMap', () => ({
  WorkspaceMap: () => null,
}))

const T = (day: string, hhmm = '10:00') => `2026-01-${day}T${hhmm}:00+00:00`

function loadJourney() {
  const stage = seg(1, {
    endsAt: T('09', '00:00'),
    startsAt: T('01', '00:00'),
    title: 'Alpha',
  })
  const moments = [
    mom(10, { startsAt: T('02'), title: 'First stop' }),
    mom(11, { startsAt: T('03'), title: 'Second stop' }),
    mom(12, { startsAt: T('06'), title: 'Third stop' }),
  ]
  state = {
    status: 'ready',
    tree: buildWorkspaceTree([stage], moments, [
      med(20, { capturedAt: T('02'), momentId: moments[0]?.id ?? null }),
    ]),
  }
}

function DayPage() {
  const { date } = useParams({ strict: false })
  const search = useSearch({ strict: false })
  return (
    <JourneyWorkspaceDay
      cull={search.cull === true}
      date={date ?? ''}
      journeyId="j"
    />
  )
}

async function renderAt(path: string) {
  const root = createRootRoute()
  const overview = createRoute({
    component: () => <JourneyWorkspace journeyId="j" />,
    getParentRoute: () => root,
    path: '/j/$journeyId/workspace',
  })
  const day = createRoute({
    component: DayPage,
    getParentRoute: () => root,
    path: '/j/$journeyId/workspace/day/$date',
    validateSearch: (search: Record<string, unknown>) =>
      search.cull === true ? { cull: true } : {},
  })
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: root.addChildren([overview, day]),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return router
}

const heading = (name: RegExp) => screen.findByRole('heading', { name })

describe('workspace overview and day page routing', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    await i18n.changeLanguage('en')
    loadJourney()
  })
  afterEach(() => {
    cleanup()
  })

  it('opens a day from its card and returns with the Overview button', async () => {
    const router = await renderAt('/j/j/workspace')
    const card = await waitFor(() => {
      const found = document.querySelector('[data-day-card="2026-01-03"]')
      expect(found).not.toBeNull()
      return found!
    })
    fireEvent.click(card)
    expect(await heading(/Saturday 3 January/)).toBeTruthy()
    expect(router.state.location.pathname).toBe('/j/j/workspace/day/2026-01-03')
    const panel = screen.getByTestId('day-panel')
    expect(within(panel).getByText(/Alpha · Day 2/)).toBeTruthy()
    expect(within(panel).getByText('Second stop')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: /Overview/ }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/j/j/workspace')
    })
    expect(await screen.findByTestId('workspace-overview')).toBeTruthy()
  })

  it('moves between days with the arrow keys and back to the overview with Escape', async () => {
    const router = await renderAt('/j/j/workspace/day/2026-01-03')
    expect(await heading(/Saturday 3 January/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    // The next day is the next day with content (6 Jan), not the next date.
    expect(await heading(/Tuesday 6 January/)).toBeTruthy()
    expect(router.state.location.pathname).toBe('/j/j/workspace/day/2026-01-06')
    // No day after the last one: the key does nothing.
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(router.state.location.pathname).toBe('/j/j/workspace/day/2026-01-06')
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(await heading(/Saturday 3 January/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(await heading(/Friday 2 January/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(router.state.location.pathname).toBe('/j/j/workspace/day/2026-01-02')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/j/j/workspace')
    })
  })

  it('previous and next buttons move between days', async () => {
    const router = await renderAt('/j/j/workspace/day/2026-01-03')
    const panel = await screen.findByTestId('day-panel')
    fireEvent.click(within(panel).getByRole('button', { name: /Next day/ }))
    expect(await heading(/Tuesday 6 January/)).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: /Previous day/ }))
    expect(await heading(/Saturday 3 January/)).toBeTruthy()
    expect(router.state.location.pathname).toBe('/j/j/workspace/day/2026-01-03')
  })

  it('keeps the stop menu on the day page', async () => {
    await renderAt('/j/j/workspace/day/2026-01-03')
    await heading(/Saturday 3 January/)
    fireEvent.click(
      screen.getByRole('button', { name: 'More actions: Second stop' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Second stop' })
    for (const action of [
      'Tags',
      'Merge with previous',
      'Merge with next',
      'Split stop',
      'Delete stop…',
    ])
      expect(within(sheet).getByRole('button', { name: action })).toBeTruthy()
    // Escape closes the sheet and does not also leave the day page.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('day-panel')).toBeTruthy()
  })

  it('opens the culling view from the top bar button and closes it again', async () => {
    const router = await renderAt('/j/j/workspace/day/2026-01-02')
    await heading(/Friday 2 January/)
    fireEvent.click(screen.getByRole('button', { name: 'Pick the best' }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ cull: true })
    })
    const view = await screen.findByRole('dialog', { name: /Pick the best/ })
    // The day panel keeps its hands off the arrows while culling.
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(router.state.location.pathname).toBe('/j/j/workspace/day/2026-01-02')
    fireEvent.click(within(view).getByRole('button', { name: 'Exit' }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({})
    })
  })

  it('opens straight in culling mode with ?cull=true', async () => {
    await renderAt('/j/j/workspace/day/2026-01-02?cull=true')
    expect(
      await screen.findByRole('dialog', { name: /Pick the best/ }),
    ).toBeTruthy()
  })

  it('ignores the arrows while typing', async () => {
    const router = await renderAt('/j/j/workspace/day/2026-01-03')
    await heading(/Saturday 3 January/)
    const input = document.createElement('textarea')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 'ArrowRight' })
    expect(router.state.location.pathname).toBe('/j/j/workspace/day/2026-01-03')
    input.remove()
  })

  it('says so when the day is not in the journey', async () => {
    await renderAt('/j/j/workspace/day/2030-01-01')
    expect(
      await screen.findByText('This day is not in the journey.'),
    ).toBeTruthy()
  })
})
