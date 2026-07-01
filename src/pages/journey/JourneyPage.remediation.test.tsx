import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { JourneyPage } from '@/pages/journey/JourneyPage'
import '@/app/i18n'

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
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/entities/journey/api/use-journey-query', () => ({
  useJourneyContributionQuery: vi.fn(() => ({
    data: false,
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
  useSession: () => ({ loading: false, user: null }),
}))
vi.mock('@/features/journeys/ui/JourneyOrganizePanel', () => ({
  JourneyOrganizePanel: () => null,
}))
vi.mock('@/features/journeys/ui/JourneyMap', () => ({
  JourneyMap: () => null,
}))
vi.mock('@/features/photos/ui/PhotoGallery', () => ({
  PhotoGallery: () => null,
}))
vi.mock('@/features/engagement/ui/ContentEngagement', () => ({
  ContentEngagement: () => null,
}))
vi.mock('@/features/journeys/ui/JourneyStorySection', () => ({
  JourneyStorySection: () => null,
}))
vi.mock('@/features/nature/ui/NatureOnTripStrip', () => ({
  NatureOnTripStrip: () => null,
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

describe('JourneyPage remediation', () => {
  afterEach(() => {
    cleanup()
    useQueryMock.mockReset()
    useJourneyQueryMock.mockReset()
  })

  it('counts a linked stop and entry as one visible moment', () => {
    const stageId = crypto.randomUUID()
    const stopId = crypto.randomUUID()
    const journey: JourneyDetail = {
      endsAt: null,
      entries: [
        {
          body: 'One user-visible moment',
          eventAt: '2026-06-01T12:00:00+00:00',
          id: crypto.randomUUID(),
          slug: null,
          stageId,
          stopId,
          title: 'Lake Louise',
          type: 'story',
        },
      ],
      guides: [],
      id: crypto.randomUUID(),
      stages: [{ id: stageId, summary: '', title: 'Rockies' }],
      spaceId: crypto.randomUUID(),
      startsAt: null,
      status: 'active',
      stops: [
        {
          id: stopId,
          mapLatitude: 51.43,
          mapLongitude: -116.18,
          notes: '',
          stageId,
          status: 'visited',
          title: 'Lake Louise',
        },
      ],
      summary: '',
      title: 'Canada 2026',
    }
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
      if (queryKey[0] === 'journey-my-role') {
        return { data: null, isError: false }
      }
      if (queryKey[0] === 'journey-owner') {
        return { data: false, isError: false }
      }
      if (queryKey[0] === 'journey-photo-tags') {
        return { data: [], isError: false, isPending: false }
      }
      if (queryKey[0] === 'journey-checklist') {
        return { data: [], isError: false, isPending: false }
      }
      if (queryKey[0] === 'journey-observations') {
        return { data: [], isError: false, isPending: false }
      }
      if (queryKey[0] === 'journey-gallery') {
        return {
          data: { failedMomentCount: 0, previewsByMoment: [[]] },
          isError: false,
          isPending: false,
        }
      }
      return { data: false, isError: false }
    })

    render(<JourneyPage journeyId={journey.id} />)

    expect(screen.getByRole('status')).toHaveTextContent('1')
    expect(screen.getByRole('status')).toHaveTextContent('1')
  })
})
