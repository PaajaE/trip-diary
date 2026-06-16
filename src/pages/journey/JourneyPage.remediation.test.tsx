import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { JourneyPage } from '@/pages/journey/JourneyPage'
import '@/app/i18n'

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
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

describe('JourneyPage remediation', () => {
  afterEach(() => {
    cleanup()
    useQueryMock.mockReset()
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
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === 'journeys') {
        return { data: journey, isError: false, refetch: vi.fn() }
      }
      if (queryKey[0] === 'journey-my-role') {
        return { data: null, isError: false }
      }
      return { data: false, isError: false }
    })

    render(<JourneyPage journeyId={journey.id} />)

    expect(screen.getByText('1 momentů')).toBeVisible()
    expect(screen.getAllByText('Lake Louise')).toHaveLength(1)
  })
})
