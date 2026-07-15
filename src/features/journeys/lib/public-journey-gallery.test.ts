import { describe, expect, it } from 'vitest'
import '@/app/i18n'
import { i18n } from '@/app/i18n'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'
import {
  buildPublicJourneyGallery,
  getPublicGalleryImageAlt,
  getPublicGalleryImageIndex,
} from '@/features/journeys/lib/public-journey-gallery'

describe('buildPublicJourneyGallery', () => {
  it('includes only photos from public stage moments in chronological order', () => {
    const stageContents = [
      createStageContent({
        dayKey: '2026-01-01',
        moments: [
          createMoment('moment-a', '2026-01-01T08:00:00.000Z', 'Earlier'),
          createMoment('moment-b', '2026-01-01T12:00:00.000Z', 'Later'),
        ],
      }),
    ]
    const photosByEntryId = new Map<string, PhotoPreview[]>([
      ['moment-a', [preview('photo-a1'), preview('photo-a2')]],
      ['moment-b', [preview('photo-b1')]],
    ])

    const gallery = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId,
      stageContents,
      t: i18n.t.bind(i18n),
    })

    expect(gallery.flatImages.map((image) => image.id)).toEqual([
      'photo-a1',
      'photo-a2',
      'photo-b1',
    ])
  })

  it('deduplicates exact asset references and keeps the first chronological occurrence', () => {
    const stageContents = [
      createStageContent({
        moments: [
          createMoment('moment-a', '2026-01-01T08:00:00.000Z', 'First'),
          createMoment('moment-b', '2026-01-02T08:00:00.000Z', 'Second'),
        ],
      }),
      createStageContent({
        dayKey: '2026-01-03',
        moments: [createMoment('moment-c', '2026-01-03T08:00:00.000Z', 'Third')],
      }),
    ]
    const sharedPreview = preview('shared-photo')
    const photosByEntryId = new Map<string, PhotoPreview[]>([
      ['moment-a', [sharedPreview, preview('photo-a2')]],
      ['moment-b', [sharedPreview]],
      ['moment-c', [preview('photo-c1')]],
    ])

    const gallery = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId,
      stageContents,
      t: i18n.t.bind(i18n),
    })

    expect(gallery.flatImages.map((image) => image.id)).toEqual([
      'shared-photo',
      'photo-a2',
      'photo-c1',
    ])
  })

  it('does not deduplicate different photos that share metadata but have different ids', () => {
    const stageContents = [
      createStageContent({
        moments: [createMoment('moment-a', '2026-01-01T08:00:00.000Z', 'View')],
      }),
    ]
    const photosByEntryId = new Map<string, PhotoPreview[]>([
      [
        'moment-a',
        [
          preview('photo-left'),
          preview('photo-right'),
        ],
      ],
    ])

    const gallery = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId,
      stageContents,
      t: i18n.t.bind(i18n),
    })

    expect(gallery.flatImages).toHaveLength(2)
  })

  it('groups images under explicit trip stages and omits empty stage groups', () => {
    const stageContents = [
      createStageContent({
        dayKey: null,
        moments: [
          createMoment('moment-a', '2026-01-01T08:00:00.000Z', 'Coast', 'stage-a'),
        ],
        stage: {
          id: '00000000-0000-4000-8000-000000000001',
          summary: '',
          title: 'North Coast',
        },
      }),
      createStageContent({
        dayKey: null,
        moments: [],
        stage: {
          id: '00000000-0000-4000-8000-000000000002',
          summary: '',
          title: 'Empty Stage',
        },
      }),
    ]
    const photosByEntryId = new Map<string, PhotoPreview[]>([
      ['moment-a', [preview('photo-a1')]],
    ])

    const gallery = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId,
      stageContents,
      t: i18n.t.bind(i18n),
    })

    expect(gallery.groups).toEqual([
      {
        imageIds: ['photo-a1'],
        key: 'stage-00000000-0000-4000-8000-000000000001',
        label: 'North Coast',
      },
    ])
  })

  it('uses day headers only when a day group has multiple images without explicit stages', () => {
    const stageContents = [
      createStageContent({
        dayKey: '2026-01-01',
        moments: [
          createMoment('moment-a', '2026-01-01T08:00:00.000Z', 'Morning'),
          createMoment('moment-b', '2026-01-01T12:00:00.000Z', 'Afternoon'),
        ],
      }),
      createStageContent({
        dayKey: '2026-01-02',
        moments: [createMoment('moment-c', '2026-01-02T08:00:00.000Z', 'Solo')],
      }),
    ]
    const photosByEntryId = new Map<string, PhotoPreview[]>([
      ['moment-a', [preview('photo-a1')]],
      ['moment-b', [preview('photo-b1')]],
      ['moment-c', [preview('photo-c1')]],
    ])

    const gallery = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId,
      stageContents,
      t: i18n.t.bind(i18n),
    })

    expect(gallery.groups).toHaveLength(2)
    expect(gallery.groups[0]?.label).not.toBeNull()
    expect(gallery.groups[1]?.label).toBeNull()
  })

  it('preserves photo order within a single moment', () => {
    const stageContents = [
      createStageContent({
        moments: [createMoment('moment-a', '2026-01-01T08:00:00.000Z', 'Set')],
      }),
    ]
    const photosByEntryId = new Map<string, PhotoPreview[]>([
      ['moment-a', [preview('photo-1'), preview('photo-2'), preview('photo-3')]],
    ])

    const gallery = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId,
      stageContents,
      t: i18n.t.bind(i18n),
    })

    expect(gallery.flatImages.map((image) => image.id)).toEqual([
      'photo-1',
      'photo-2',
      'photo-3',
    ])
  })
})

describe('gallery helpers', () => {
  it('builds alt text from the moment title or falls back to untitled', () => {
    const titled = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId: new Map([
        ['moment-a', [preview('photo-a1')]],
      ]),
      stageContents: [
        createStageContent({
          moments: [createMoment('moment-a', '2026-01-01T08:00:00.000Z', 'Sunrise')],
        }),
      ],
      t: i18n.t.bind(i18n),
    }).flatImages[0]
    const untitled = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId: new Map([
        ['moment-a', [preview('photo-a1')]],
      ]),
      stageContents: [
        createStageContent({
          moments: [createMoment('moment-a', '2026-01-01T08:00:00.000Z', null)],
        }),
      ],
      t: i18n.t.bind(i18n),
    }).flatImages[0]

    expect(titled === undefined || untitled === undefined).toBe(false)
    if (titled === undefined || untitled === undefined) {
      throw new Error('Expected gallery images')
    }

    expect(getPublicGalleryImageAlt(titled, i18n.t.bind(i18n))).toBe('Sunrise')
    expect(getPublicGalleryImageAlt(untitled, i18n.t.bind(i18n))).toMatch(
      /Journey moment|moment cesty/i,
    )
  })

  it('resolves flat indices for lightbox navigation across grouped sections', () => {
    const gallery = buildPublicJourneyGallery({
      locale: 'en',
      photosByEntryId: new Map([
        ['moment-a', [preview('photo-a1')]],
        ['moment-b', [preview('photo-b1')]],
      ]),
      stageContents: [
        createStageContent({
          dayKey: '2026-01-01',
          moments: [createMoment('moment-a', '2026-01-01T08:00:00.000Z', 'A')],
        }),
        createStageContent({
          dayKey: '2026-01-02',
          moments: [createMoment('moment-b', '2026-01-02T08:00:00.000Z', 'B')],
        }),
      ],
      t: i18n.t.bind(i18n),
    })

    expect(getPublicGalleryImageIndex(gallery, 'photo-b1')).toBe(1)
  })
})

function preview(id: string): PhotoPreview {
  return {
    blob: new Blob([id]),
    id,
  }
}

function createMoment(
  id: string,
  eventAt: string,
  title: string | null,
  stageId: string | null = null,
) {
  return {
    entry: {
      body: '',
      eventAt,
      id,
      slug: id,
      stageId,
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
    ],
    plannedStops: [],
    stage: null,
    ...overrides,
  }
}
