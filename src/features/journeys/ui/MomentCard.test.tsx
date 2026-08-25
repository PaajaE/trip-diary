import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { MomentCard } from '@/features/journeys/ui/MomentCard'
import '@/app/i18n'

vi.mock('@/features/photos/ui/EntryPhotoGrid', () => ({
  EntryPhotoGrid: () => null,
}))
vi.mock('@/features/nature/ui/NatureMatchBanner', () => ({
  NatureMatchBanner: () => null,
}))
vi.mock('@/shared/ui/use-toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))
vi.mock('@/entities/entry/api/entry-mutation.repository', () => ({
  updateEntryContent: vi.fn(),
}))
vi.mock('@/shared/sync/auto-sync', () => ({
  canAutomaticallySync: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/shared/sync/sync.service', () => ({
  syncPendingOperations: vi.fn().mockResolvedValue(undefined),
}))

const entryId = crypto.randomUUID()
const journeyId = crypto.randomUUID()

function buildJourney(): JourneyDetail {
  return {
    endsAt: null,
    entries: [
      {
        body: 'On-screen body from the trip',
        eventAt: '2026-07-04T12:00:00+00:00',
        id: entryId,
        slug: 'moment',
        stageId: null,
        stopId: null,
        syncStatus: 'synced',
        title: 'On-screen title',
        type: 'story',
      },
    ],
    guides: [],
    id: journeyId,
    stages: [],
    spaceId: crypto.randomUUID(),
    startsAt: null,
    status: 'active',
    stops: [],
    summary: '',
    title: 'Trip',
  }
}

function buildMoment(journey: JourneyDetail): JourneyMoment {
  const entry = journey.entries[0]
  if (entry === undefined) {
    throw new Error('expected a moment entry')
  }
  return {
    entry,
    location: null,
    stop: null,
  }
}

function renderCard(journey: JourneyDetail) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MomentCard
        canEdit
        creatorId={crypto.randomUUID()}
        expanded
        journey={journey}
        journeyId={journey.id}
        moment={buildMoment(journey)}
        photos={[]}
        tagsByPhotoId={new Map()}
      />
    </QueryClientProvider>,
  )
}

describe('MomentCard inline editing', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens the editor with the on-screen title and body', async () => {
    const user = userEvent.setup()
    renderCard(buildJourney())

    expect(
      screen.getByRole('heading', { name: 'On-screen title' }),
    ).toBeVisible()
    expect(screen.getByText('On-screen body from the trip')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Upravit' }))

    expect(screen.getByLabelText('Název')).toHaveValue('On-screen title')
    expect(screen.getByLabelText('Příběh')).toHaveValue(
      'On-screen body from the trip',
    )
    expect(
      screen.queryByRole('heading', { name: 'On-screen title' }),
    ).not.toBeInTheDocument()
  })
})
