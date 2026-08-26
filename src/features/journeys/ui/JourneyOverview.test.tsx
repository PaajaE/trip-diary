import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { JourneyOverview } from '@/features/journeys/ui/JourneyOverview'
import '@/app/i18n'

vi.mock('@/entities/checklist/api/checklist-mutation.repository', () => ({
  listJourneyChecklistItems: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/features/journeys/ui/JourneyStorySection', () => ({
  JourneyStorySection: () => <div data-testid="story-section" />,
}))

const journeyId = '00000000-0000-4000-8000-000000000001'

function buildJourney(overrides: Partial<JourneyDetail> = {}): JourneyDetail {
  return {
    endsAt: null,
    entries: [],
    guides: [],
    id: journeyId,
    stages: [],
    spaceId: '00000000-0000-4000-8000-000000000002',
    startsAt: null,
    status: 'planning',
    stops: [],
    summary: '',
    title: 'Kanada 2026',
    ...overrides,
  }
}

function buildMoment(): JourneyMoment {
  return {
    entry: {
      body: 'Sample body',
      eventAt: '2026-08-24T23:15:00.000Z',
      id: '00000000-0000-4000-8000-000000000010',
      slug: 'rocky',
      stageId: null,
      stopId: null,
      title: 'Rocky Mountains',
      type: 'story',
    },
    location: null,
    stop: null,
  }
}

function renderOverview({
  moments = [],
  summary = '',
}: {
  moments?: JourneyMoment[]
  summary?: string
}) {
  const journey = buildJourney({
    entries: moments.map((moment) => moment.entry),
    summary,
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <JourneyOverview
        canEdit={false}
        creatorId="00000000-0000-4000-8000-000000000099"
        journey={journey}
        journeyId={journeyId}
        mapPointCount={0}
        moments={moments}
        onChanged={vi.fn()}
        photoCount={0}
        stageContents={[]}
      />
    </QueryClientProvider>,
  )
}

describe('JourneyOverview summary fallback', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the add-first-moment fallback only when the journey has no moments', () => {
    renderOverview({ moments: [] })

    expect(
      screen.getByText(
        'Cesta je připravená. Teď už stačí přidat první moment a všechno začne dávat smysl.',
      ),
    ).toBeInTheDocument()
  })

  it('does not tell readers to add the first moment when moments already exist', () => {
    renderOverview({ moments: [buildMoment()] })

    expect(
      screen.queryByText(
        'Cesta je připravená. Teď už stačí přidat první moment a všechno začne dávat smysl.',
      ),
    ).not.toBeInTheDocument()
  })
})
