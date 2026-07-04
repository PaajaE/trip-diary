import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { JourneyPage } from '@/pages/journey/JourneyPage'
import '@/app/i18n'

const navigateMock = vi.fn()

const { useJourneyQueryMock, useQueryMock } = vi.hoisted(() => ({
  useJourneyQueryMock: vi.fn(),
  useQueryMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    'aria-label': ariaLabel,
    children,
    to,
  }: {
    'aria-label'?: string
    children: React.ReactNode
    to: string
  }) => (
    <a aria-label={ariaLabel} href={to}>
      {children}
    </a>
  ),
  useNavigate: () => navigateMock,
}))
vi.mock('@/entities/journey/api/use-journey-query', () => ({
  useJourneyContributionQuery: vi.fn(() => ({
    data: true,
    isError: false,
    isLoading: false,
  })),
  useJourneyQuery: useJourneyQueryMock,
}))
vi.mock('@/entities/photo/api/backfill-photo-gps.repository', () => ({
  backfillEntryPhotoGps: vi.fn().mockResolvedValue({ filledPhotoIds: [] }),
}))
vi.mock('@/shared/sync/sync.service', () => ({
  syncPendingOperations: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/features/journeys/ui/JourneyGallery', () => ({
  JourneyGallery: () => null,
}))
vi.mock('@/features/auth/session', () => ({
  useSession: () => ({
    loading: false,
    user: { id: 'user-1' },
  }),
}))
vi.mock('@/features/journeys/ui/JourneyOrganizePanel', () => ({
  JourneyOrganizePanel: () => null,
}))
vi.mock('@/features/journeys/ui/JourneyMap', () => ({
  JourneyMap: () => <div data-testid="journey-map" />,
}))
vi.mock('@/features/photos/ui/PhotoGallery', () => ({
  PhotoGallery: () => null,
}))
vi.mock('@/features/engagement/ui/ContentEngagement', () => ({
  ContentEngagement: () => null,
}))
vi.mock('@/features/sharing/hooks/use-journey-public-share', () => ({
  useJourneyPublicShare: () => ({
    isLoading: false,
    paths: null,
    tripShare: null,
  }),
}))
vi.mock('@/features/journeys/ui/JourneyStorySection', () => ({
  JourneyStorySection: () => null,
}))
vi.mock('@/features/nature/ui/NatureOnTripStrip', () => ({
  NatureOnTripStrip: () => null,
}))
vi.mock('@/entities/photo/api/photo-gallery.repository', () => ({
  getJourneyEntryPhotoPreviews: vi.fn().mockResolvedValue({
    failedEntryIds: new Set<string>(),
    previewsByEntry: new Map(),
  }),
}))
vi.mock('@/shared/ui/ToastProvider', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ showToast: vi.fn() }),
}))

function buildJourney(overrides: Partial<JourneyDetail> = {}): JourneyDetail {
  return {
    endsAt: null,
    entries: [],
    guides: [],
    id: 'journey-1',
    stages: [],
    spaceId: 'space-1',
    startsAt: null,
    status: 'active',
    stops: [],
    summary: 'A quick summary',
    title: 'Iceland Ring Road',
    ...overrides,
  }
}

function mockJourneyQueries(journey: JourneyDetail) {
  useJourneyQueryMock.mockReturnValue({
    data: journey,
    isError: false,
    isLoading: false,
    isRevalidating: false,
    refetch: vi.fn(),
  })
  useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === 'journey-photo-locations') {
      return { data: [], isError: false, refetch: vi.fn() }
    }
    if (queryKey[0] === 'journey-gallery') {
      return {
        data: { failedMomentCount: 0, previewsByMoment: [[]] },
        isError: false,
        isPending: false,
      }
    }
    if (queryKey[0] === 'journey-photo-tags') {
      return { data: [], isError: false, isPending: false }
    }
    if (queryKey[0] === 'journey-my-role') {
      return { data: 'owner', isError: false }
    }
    if (queryKey[0] === 'journey-owner') {
      return { data: true, isError: false }
    }
    if (queryKey[0] === 'journey-checklist') {
      return { data: [], isError: false, isPending: false }
    }
    if (queryKey[0] === 'journey-observations') {
      return { data: [], isError: false, isPending: false }
    }
    return { data: false, isError: false }
  })
}

describe('JourneyPage author scroll', () => {
  afterEach(() => {
    cleanup()
    navigateMock.mockReset()
    useQueryMock.mockReset()
    useJourneyQueryMock.mockReset()
  })

  it('shows summary, story, map, and gallery on one page', () => {
    const journey = buildJourney({
      entries: [
        {
          body: 'Glacier hike',
          eventAt: '2026-06-01T12:00:00+00:00',
          id: 'entry-1',
          slug: null,
          stageId: null,
          stopId: null,
          title: 'Skaftafell',
          type: 'story',
        },
      ],
    })
    mockJourneyQueries(journey)

    render(<JourneyPage journeyId={journey.id} />)

    expect(screen.getByText('A quick summary')).toBeVisible()
    expect(screen.getByLabelText('Přidat moment')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Příběh' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Mapa cesty' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Galerie' })).toBeVisible()
  })

  it('shows empty-trip capture actions', () => {
    const journey = buildJourney()
    mockJourneyQueries(journey)

    render(<JourneyPage journeyId={journey.id} />)

    expect(screen.getByRole('button', { name: 'Přidat fotky' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Přidat místo na mapě' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Přidat poznámku' }),
    ).toBeVisible()
  })

  it('opens the add sheet from the floating action button', async () => {
    const user = userEvent.setup()
    const journey = buildJourney()
    mockJourneyQueries(journey)

    render(<JourneyPage journeyId={journey.id} />)

    await user.click(screen.getByLabelText('Přidat moment'))

    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByText('Přidat na cestu')).toBeVisible()
  })
})
