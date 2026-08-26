import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { MomentCard } from '@/features/journeys/ui/MomentCard'
import '@/app/i18n'

vi.mock('@/features/photos/lib/use-photo-object-urls', () => ({
  usePhotoObjectUrls: (photos: PhotoPreview[]) =>
    photos.map((photo) => ({ ...photo, url: `blob:${photo.id}` })),
}))
vi.mock('@/shared/ui/use-toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))
vi.mock('@/entities/entry/api/entry-mutation.repository', () => ({
  deleteEntry: vi.fn(),
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
        body: 'On-screen body from the trip with enough text to clamp across multiple lines when rendered in the compact card preview.',
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

function buildPhoto(id: string): PhotoPreview {
  return {
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    id,
  }
}

function renderCard(
  journey: JourneyDetail,
  options?: {
    onOpen?: (entryId: string) => void
    photoCount?: number
    photos?: PhotoPreview[]
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MomentCard
        canEdit
        creatorId={crypto.randomUUID()}
        journeyId={journey.id}
        moment={buildMoment(journey)}
        {...(options?.onOpen !== undefined ? { onOpen: options.onOpen } : {})}
        {...(options?.photoCount !== undefined
          ? { photoCount: options.photoCount }
          : {})}
        photos={options?.photos ?? []}
      />
    </QueryClientProvider>,
  )
}

describe('MomentCard authoring preview', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens the moment when the card is clicked', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    renderCard(buildJourney(), { onOpen })

    await user.click(
      screen.getByRole('button', {
        name: 'Otevřít moment: On-screen title',
      }),
    )

    expect(onOpen).toHaveBeenCalledWith(entryId)
  })

  it('opens the editor without triggering card navigation', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    renderCard(buildJourney(), { onOpen })

    await user.click(screen.getByRole('button', { name: 'Upravit' }))

    expect(screen.getByLabelText('Název')).toHaveValue('On-screen title')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('renders only preview media and shows +N for extra photos', () => {
    const { container } = renderCard(buildJourney(), {
      photoCount: 8,
      photos: [
        buildPhoto('photo-1'),
        buildPhoto('photo-2'),
        buildPhoto('photo-3'),
      ],
    })

    expect(container.querySelectorAll('img')).toHaveLength(3)
    expect(screen.getByText('+5')).toBeVisible()
  })

  it('shows a clamped excerpt without requiring expansion', () => {
    renderCard(buildJourney())

    expect(screen.getByText(/On-screen body from the trip/)).toHaveClass(
      'line-clamp-3',
    )
    expect(
      screen.queryByRole('button', { name: 'Rozbalit' }),
    ).not.toBeInTheDocument()
  })
})
