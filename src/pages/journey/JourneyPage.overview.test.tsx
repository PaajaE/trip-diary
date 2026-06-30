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
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
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
vi.mock('@/entities/photo/api/photo-gallery.repository', () => ({
  getJourneyEntryPhotoPreviews: vi.fn().mockResolvedValue({
    failedEntryIds: new Set<string>(),
    previewsByEntry: new Map(),
  }),
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

describe('JourneyPage overview hub', () => {
  afterEach(() => {
    cleanup()
    navigateMock.mockReset()
    useQueryMock.mockReset()
    useJourneyQueryMock.mockReset()
  })

  it('shows overview stats and capture actions by default', () => {
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
      guides: [{ body: 'Book early', id: 'guide-1', title: 'Parking' }],
    })
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
      return { data: false, isError: false }
    })

    render(<JourneyPage journeyId={journey.id} />)

    expect(screen.getByRole('heading', { name: 'Přehled' })).toBeVisible()
    expect(screen.getByText('1 momentů')).toBeVisible()
    expect(screen.getByText('1 rad')).toBeVisible()
    expect(screen.getByText('Přidat moment')).toBeVisible()
    expect(screen.getByText('Přidat místo na mapě')).toBeVisible()
    expect(screen.getByText('Skaftafell')).toBeVisible()
  })

  it('switches to story tab locally without router navigation', async () => {
    const user = userEvent.setup()
    const journey = buildJourney()
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
          data: { failedMomentCount: 0, previewsByMoment: [] },
          isError: false,
          isPending: false,
        }
      }
      if (queryKey[0] === 'journey-my-role') {
        return { data: 'owner', isError: false }
      }
      if (queryKey[0] === 'journey-owner') {
        return { data: true, isError: false }
      }
      return { data: false, isError: false }
    })

    render(<JourneyPage journeyId={journey.id} />)

    await user.click(screen.getByRole('button', { name: 'Příběh' }))

    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Příběh' })).toBeVisible()
    expect(screen.getByText('Začni prvním momentem')).toBeVisible()
  })

  it('routes add advice capture action to the guides tab', async () => {
    const user = userEvent.setup()
    const journey = buildJourney()
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
          data: { failedMomentCount: 0, previewsByMoment: [] },
          isError: false,
          isPending: false,
        }
      }
      if (queryKey[0] === 'journey-my-role') {
        return { data: 'owner', isError: false }
      }
      if (queryKey[0] === 'journey-owner') {
        return { data: true, isError: false }
      }
      return { data: false, isError: false }
    })

    render(<JourneyPage journeyId={journey.id} />)

    await user.click(screen.getByRole('button', { name: 'Přidat radu' }))

    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Rady' })).toBeVisible()
  })
})
