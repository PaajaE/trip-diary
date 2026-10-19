import '@/app/i18n'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useParams,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_IDS,
  publicJourneyFixture,
} from '@/entities/public-journey/lib/public-journey.fixture'
import { PublicJourneyPage } from '@/pages/public-journey/PublicJourneyPage'
import { PublicMomentPage } from '@/pages/public-journey/PublicMomentPage'
import { PublicSegmentPage } from '@/pages/public-journey/PublicSegmentPage'

vi.mock('@/features/public-journey/ui/PublicJourneyMap', () => ({
  default: (props: { lines: unknown[]; points: unknown[] }) => (
    <div
      data-lines={props.lines.length}
      data-points={props.points.length}
      data-testid="map"
    />
  ),
}))

const data = publicJourneyFixture
const base = { journeySlug: 'kanada-2026', spaceHandle: 'ecerovi' }

function Journey() {
  return <PublicJourneyPage data={data} {...base} />
}
function Segment() {
  const { segmentId } = useParams({ strict: false })
  return <PublicSegmentPage data={data} segmentId={segmentId ?? ''} {...base} />
}
function Moment() {
  const { momentId } = useParams({ strict: false })
  return <PublicMomentPage data={data} momentId={momentId ?? ''} {...base} />
}

async function renderAt(path: string) {
  const root = createRootRoute()
  const routes = [
    createRoute({
      component: Journey,
      getParentRoute: () => root,
      path: '/$spaceHandle/$journeySlug',
    }),
    createRoute({
      component: Segment,
      getParentRoute: () => root,
      path: '/$spaceHandle/$journeySlug/e/$segmentId',
    }),
    createRoute({
      component: Moment,
      getParentRoute: () => root,
      path: '/$spaceHandle/$journeySlug/m/$momentId',
    }),
  ]
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: root.addChildren(routes),
  })
  render(<RouterProvider router={router} />)
  await waitFor(() => {
    expect(document.querySelector('main')).not.toBeNull()
  })
}

describe('public journey pages', () => {
  afterEach(cleanup)

  it('renders the journey with hero priority image, map, stages, timeline, places', async () => {
    await renderAt('/ecerovi/kanada-2026')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Kanada 2026' }),
    ).toBeTruthy()
    const hero = screen.getAllByRole('img')[0]
    expect(hero?.getAttribute('fetchpriority')).toBe('high')
    expect(hero?.getAttribute('width')).toBe('1200')
    expect(hero?.getAttribute('srcset')).toContain('2400w')
    // Only the hero is high priority; the rest is lazy.
    expect(
      screen
        .getAllByRole('img')
        .filter((i) => i.getAttribute('fetchpriority') === 'high'),
    ).toHaveLength(1)
    expect((await screen.findByTestId('map')).getAttribute('data-points')).toBe(
      '2',
    )
    expect(
      screen.getAllByRole('link', { name: /Rockies/ })[0]?.getAttribute('href'),
    ).toBe(`/ecerovi/kanada-2026/e/${FIXTURE_IDS.stage}`)
    expect(screen.getByText('Assiniboine, Alberta')).toBeTruthy()
    expect(
      screen.getAllByText('Názvy míst © Seznam.cz a.s.').length,
    ).toBeGreaterThan(0)
  })

  it('renders a stage with its trips as chapters', async () => {
    await renderAt(`/ecerovi/kanada-2026/e/${FIXTURE_IDS.stage}`)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Rockies' }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Assiniboine trek' })).toBeTruthy()
    expect(screen.getByText('Šest dní trekem.')).toBeTruthy()
  })

  it('renders a trek with distance and ascent from the track', async () => {
    await renderAt(`/ecerovi/kanada-2026/e/${FIXTURE_IDS.trip}`)
    const stats = screen.getByRole('main')
    expect(within(stats).getByText('24.5 km')).toBeTruthy()
    expect(within(stats).getByText('850 m')).toBeTruthy()
    expect((await screen.findByTestId('map')).getAttribute('data-lines')).toBe(
      '1',
    )
    expect(within(stats).getByRole('link', { name: 'Lake Magog' })).toBeTruthy()
  })

  it('shows a moment with place attribution and prev/next', async () => {
    await renderAt(`/ecerovi/kanada-2026/m/${FIXTURE_IDS.momentA}`)
    expect(screen.getByText('Assiniboine, Alberta')).toBeTruthy()
    expect(screen.getByText('Názvy míst © Seznam.cz a.s.')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Další/ }).getAttribute('href'),
    ).toBe(`/ecerovi/kanada-2026/m/${FIXTURE_IDS.hiddenMoment}`)
    expect(screen.queryByRole('link', { name: /Předchozí/ })).toBeNull()
  })

  it('hides the place when the RPC returns null coordinates', async () => {
    await renderAt(`/ecerovi/kanada-2026/m/${FIXTURE_IDS.hiddenMoment}`)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Soukromé místo' }),
    ).toBeTruthy()
    expect(screen.queryByText('Assiniboine, Alberta')).toBeNull()
    expect(screen.queryByText('Názvy míst © Seznam.cz a.s.')).toBeNull()
  })

  it('does not pin moments without coordinates on the map', async () => {
    await renderAt('/ecerovi/kanada-2026')
    // 3 moments, one with null coordinates.
    expect((await screen.findByTestId('map')).getAttribute('data-points')).toBe(
      '2',
    )
  })

  it('renders the not-found message for unknown ids', async () => {
    await renderAt(
      '/ecerovi/kanada-2026/m/00000000-0000-4000-8000-0000000000ff',
    )
    expect(screen.getByText('Tento moment neexistuje.')).toBeTruthy()
  })
})
