import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'
import {
  JourneyReaderStory,
  ReaderMomentArticle,
} from '@/features/journeys/ui/JourneyReaderStory'

vi.mock('@/features/photos/lib/use-photo-lightbox', () => ({
  usePhotoLightbox: () => ({
    lightboxElement: null,
    openLightbox: vi.fn(),
  }),
}))

vi.mock('@/features/photos/lib/use-photo-object-urls', () => ({
  usePhotoObjectUrls: <T extends { id: string }>(photos: T[]) =>
    photos.map((photo) => ({ ...photo, url: `blob:${photo.id}` })),
}))

vi.mock('@/features/engagement/ui/ContentEngagement', () => ({
  ContentEngagement: () => <div data-testid="engagement-meta" />,
}))

describe('JourneyReaderStory', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the no-stage day-group fallback', () => {
    render(
      <JourneyReaderStory
        onOpenEntry={vi.fn()}
        photosByEntryId={new Map()}
        stageContents={[createStageContent()]}
        tagsByPhotoId={new Map()}
      />,
    )

    expect(screen.getByText('Morning view')).toBeInTheDocument()
  })

  it('shows stage names when stages exist', () => {
    render(
      <JourneyReaderStory
        onOpenEntry={vi.fn()}
        photosByEntryId={new Map()}
        stageContents={[
          createStageContent({
            stage: {
              id: '00000000-0000-4000-8000-000000000001',
              summary: '',
              title: 'North Coast',
            },
          }),
        ]}
        tagsByPhotoId={new Map()}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'North Coast' }),
    ).toBeInTheDocument()
  })
})

describe('ReaderMomentArticle', () => {
  afterEach(() => {
    cleanup()
  })

  it('activates the moment from the card hit target and keyboard focus', () => {
    const onOpenEntry = vi.fn()
    const moment = createStageContent().moments[0]
    if (moment === undefined) {
      throw new Error('Expected a moment fixture')
    }

    render(
      <ReaderMomentArticle
        index={1}
        moment={moment}
        onOpenEntry={onOpenEntry}
        photos={[]}
        tagsByPhotoId={new Map()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Open moment:|Otevřít moment:/i }),
    )
    expect(onOpenEntry).toHaveBeenCalledWith(moment.entry.id)
  })

  it('renders the open moment action hint without button semantics', () => {
    const moment = createStageContent().moments[0]
    if (moment === undefined) {
      throw new Error('Expected a moment fixture')
    }

    render(
      <ReaderMomentArticle
        index={1}
        moment={moment}
        onOpenEntry={vi.fn()}
        photos={[]}
        tagsByPhotoId={new Map()}
      />,
    )

    const hint = screen
      .getByText(/Open moment|Otevřít moment/)
      .closest('.reader-moment-card__action-hint')
    expect(hint).not.toBeNull()
  })

  it('does not activate the parent card when a child photo control is clicked', () => {
    const onOpenEntry = vi.fn()
    const moment = createStageContent().moments[0]
    if (moment === undefined) {
      throw new Error('Expected a moment fixture')
    }

    render(
      <ReaderMomentArticle
        index={1}
        moment={moment}
        onOpenEntry={onOpenEntry}
        photos={[{ blob: new Blob(), id: 'photo-1' }]}
        tagsByPhotoId={new Map()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Morning view' }))

    expect(onOpenEntry).not.toHaveBeenCalled()
  })

  it('marks the active card state', () => {
    const moment = createStageContent().moments[0]
    if (moment === undefined) {
      throw new Error('Expected a moment fixture')
    }

    const { container } = render(
      <ReaderMomentArticle
        active
        index={1}
        moment={moment}
        onOpenEntry={vi.fn()}
        photos={[]}
        tagsByPhotoId={new Map()}
      />,
    )

    expect(
      container.querySelector('.reader-moment-card--active'),
    ).not.toBeNull()
  })

  it('omits a planned-stop label that repeats the moment title', () => {
    const base = createStageContent().moments[0]
    if (base === undefined) {
      throw new Error('Expected a moment fixture')
    }

    render(
      <ReaderMomentArticle
        index={1}
        moment={{
          ...base,
          stop: {
            id: '00000000-0000-4000-8000-000000000099',
            mapLatitude: null,
            mapLongitude: null,
            notes: '',
            stageId: null,
            status: 'planned',
            title: 'Morning view',
          },
        }}
        onOpenEntry={vi.fn()}
        photos={[]}
        tagsByPhotoId={new Map()}
      />,
    )

    expect(screen.getAllByText('Morning view')).toHaveLength(1)
  })
})

function createStageContent(
  overrides: Partial<JourneyStageContent> = {},
): JourneyStageContent {
  return {
    dayKey: '2026-01-01',
    moments: [
      {
        entry: {
          body: 'Sample body',
          eventAt: '2026-01-01T08:00:00.000Z',
          id: 'moment-1',
          slug: null,
          stageId: null,
          stopId: null,
          title: 'Morning view',
          type: 'story',
        },
        location: null,
        stop: null,
      },
    ],
    plannedStops: [],
    stage: null,
    ...overrides,
  }
}
