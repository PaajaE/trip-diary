import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'

const photosState = vi.hoisted(() => ({
  photosByEntryId: new Map<string, PhotoPreview[]>(),
}))

vi.mock('@/features/journeys/lib/use-journey-moment-photos', () => ({
  useJourneyMomentPhotos: () => ({
    isPending: false,
    photosByEntryId: photosState.photosByEntryId,
  }),
}))

vi.mock('@/shared/lib/photo-object-url-cache', () => ({
  getCachedPhotoObjectUrl: () => undefined,
  resolvePhotoObjectUrl: vi.fn(async (photoId: string) => `blob:${photoId}`),
}))

vi.mock('@/features/photos/lib/use-photo-object-urls', () => ({
  usePhotoObjectUrls: <T extends { blob: Blob; id: string }>(photos: T[]) =>
    photos.map((photo) => ({ ...photo, url: `blob:${photo.id}` })),
}))

vi.mock('@/entities/photo/api/photo-gallery.repository', () => ({
  getPhotoDetailPreview: vi.fn(async (photoId: string) => ({
    blob: new Blob([photoId]),
    id: photoId,
  })),
}))

import { JourneyReaderGallery } from '@/features/journeys/ui/JourneyReaderGallery'

describe('JourneyReaderGallery', () => {
  beforeEach(() => {
    photosState.photosByEntryId = new Map([
      [
        'moment-1',
        [
          { blob: new Blob(['one']), id: 'photo-1' },
          { blob: new Blob(['two']), id: 'photo-2' },
        ],
      ],
      ['moment-2', [{ blob: new Blob(['three']), id: 'photo-3' }]],
    ])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders nothing when there are no public images', () => {
    photosState.photosByEntryId = new Map()
    const { container } = renderGallery([
      createStageContent({ moments: [] }),
    ])
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a single-image gallery and opens the lightbox at the correct index', async () => {
    photosState.photosByEntryId = new Map([
      ['moment-1', [{ blob: new Blob(['one']), id: 'photo-1' }]],
    ])

    renderGallery([
      createStageContent({
        moments: [
          createMoment('moment-1', '2026-01-01T08:00:00.000Z', 'Sunrise'),
        ],
      }),
    ])

    const item = screen.getByRole('button', { name: 'Sunrise' })
    fireEvent.click(item)

    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByText('1 / 1')).toBeVisible()
  })

  it('shows stage headings when explicit stages exist', () => {
    photosState.photosByEntryId = new Map([
      ['moment-1', [{ blob: new Blob(['one']), id: 'photo-1' }]],
    ])

    renderGallery([
      createStageContent({
        dayKey: null,
        moments: [
          createMoment('moment-1', '2026-01-01T08:00:00.000Z', 'Coast view'),
        ],
        stage: {
          id: '00000000-0000-4000-8000-000000000001',
          summary: '',
          title: 'North Coast',
        },
      }),
    ])

    expect(
      screen.getByRole('heading', { level: 3, name: 'North Coast' }),
    ).toBeInTheDocument()
  })

  it('activates gallery items from the keyboard', async () => {
    renderGallery([
      createStageContent({
        moments: [
          createMoment('moment-1', '2026-01-01T08:00:00.000Z', 'Sunrise'),
          createMoment('moment-2', '2026-01-02T08:00:00.000Z', 'Sunset'),
        ],
      }),
    ])

    const secondItem = screen.getByRole('button', { name: 'Sunset' })
    secondItem.focus()
    fireEvent.keyDown(secondItem, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeVisible()
    })
    expect(screen.getByText('3 / 3')).toBeVisible()
  })
})

function renderGallery(stageContents: JourneyStageContent[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <JourneyReaderGallery stageContents={stageContents} />
    </QueryClientProvider>,
  )
}

function createMoment(id: string, eventAt: string, title: string) {
  return {
    entry: {
      body: '',
      eventAt,
      id,
      slug: id,
      stageId: null,
      stopId: null,
      title,
      type: 'story' as const,
    },
    location: null,
    stop: null,
  }
}

function createStageContent(
  overrides: Partial<JourneyStageContent> = {},
): JourneyStageContent {
  return {
    dayKey: '2026-01-01',
    moments: [
      createMoment('moment-1', '2026-01-01T08:00:00.000Z', 'Morning view'),
      createMoment('moment-2', '2026-01-02T08:00:00.000Z', 'Sunset'),
    ],
    plannedStops: [],
    stage: null,
    ...overrides,
  }
}
