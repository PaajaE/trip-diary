import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { JourneyStorySection } from '@/features/journeys/ui/JourneyStorySection'
import '@/app/i18n'

vi.mock('@/features/journeys/lib/use-journey-author-moment-previews', () => ({
  useJourneyAuthorMomentPreviews: () => ({
    isPending: false,
    photoCount: 0,
    photoCountsByEntry: new Map(),
    previewsByEntry: new Map(),
  }),
}))
vi.mock('@/features/journeys/ui/MomentCard', () => ({
  MomentCard: ({
    moment,
    onOpen,
  }: {
    moment: JourneyMoment
    onOpen?: (entryId: string) => void
  }) => (
    <button onClick={() => onOpen?.(moment.entry.id)} type="button">
      {moment.entry.title}
    </button>
  ),
}))

const journeyId = crypto.randomUUID()

function buildJourney(): JourneyDetail {
  return {
    endsAt: null,
    entries: [],
    guides: [],
    id: journeyId,
    stages: [],
    spaceId: crypto.randomUUID(),
    startsAt: null,
    status: 'planning',
    stops: [
      {
        id: 'stop-1',
        mapLatitude: null,
        mapLongitude: null,
        notes: '',
        position: 0,
        stageId: null,
        status: 'planned' as const,
        title: 'Banff',
      },
    ],
    summary: '',
    title: 'Kanada',
  }
}

describe('JourneyStorySection planned stops', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows compact planned rows and keeps moment open interaction', async () => {
    const user = userEvent.setup()
    const onOpenMoment = vi.fn()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <JourneyStorySection
          canEdit={false}
          creatorId={crypto.randomUUID()}
          journey={buildJourney()}
          journeyId={journeyId}
          moments={[
            {
              entry: {
                body: '',
                eventAt: null,
                id: 'entry-1',
                slug: null,
                stageId: null,
                stopId: null,
                title: 'Calgary',
                type: 'story',
              },
              location: null,
              stop: null,
            },
          ]}
          onChanged={vi.fn()}
          onOpenMoment={onOpenMoment}
          stageContents={[
            {
              dayKey: 'undated',
              moments: [
                {
                  entry: {
                    body: '',
                    eventAt: null,
                    id: 'entry-1',
                    slug: null,
                    stageId: null,
                    stopId: null,
                    title: 'Calgary',
                    type: 'story',
                  },
                  location: null,
                  stop: null,
                },
              ],
              plannedStops: [
                {
                  id: 'stop-1',
                  mapLatitude: null,
                  mapLongitude: null,
                  notes: '',
                  position: 0,
                  stageId: null,
                  status: 'planned' as const,
                  title: 'Banff',
                },
              ],
              stage: null,
            },
          ]}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Banff')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Calgary' }))
    expect(onOpenMoment).toHaveBeenCalledWith('entry-1')
  })
})
