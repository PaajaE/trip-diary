import { describe, expect, it } from 'vitest'
import {
  normalizeQuery,
  searchJourney,
  type SearchData,
  type SearchMoment,
} from '@/features/journey-workspace/model/journey-search'
import { med } from '@/features/journey-workspace/test-fixtures'

function sm(id: string, over: Partial<SearchMoment> = {}): SearchMoment {
  return {
    body: '',
    id,
    placeLabel: null,
    startsAt: '2026-01-02T10:00:00+00:00',
    title: null,
    tz: 'Europe/Prague',
    ...over,
  }
}

const EMPTY: SearchData = { dayNotes: [], media: [], moments: [] }

describe('normalizeQuery', () => {
  it('lower-cases, strips accents and collapses whitespace', () => {
    expect(normalizeQuery('  Ježero \t  ŠÍLENÉ\n')).toBe('jezero silene')
  })
  it('handles decomposed input', () => {
    expect(normalizeQuery('Z\u030Cabka')).toBe('zabka')
  })
  it('returns empty for blank text', () => {
    expect(normalizeQuery('   ')).toBe('')
  })
})

describe('searchJourney text', () => {
  const data: SearchData = {
    dayNotes: [{ body: 'Celý den u jezera, pak hospoda.', date: '2026-01-03' }],
    media: [
      med(1, { caption: 'Západ slunce nad jezerem' }),
      med(2, { caption: null }),
    ],
    moments: [
      sm('m1', { body: 'Koupání v Jezeře', title: 'Ráno' }),
      sm('m2', { placeLabel: 'Hotel Jezero', title: null }),
      sm('m3', { body: 'Nic', title: 'Hory' }),
    ],
  }

  it('finds accent- and case-insensitively in every group', () => {
    const out = searchJourney(data, 'JEZERO')
    expect(out.counts).toEqual({ day: 0, media: 0, moment: 1 })
    expect(out.results.map((r) => r.id)).toEqual(['m2'])
    const out2 = searchJourney(data, 'jezer')
    expect(out2.counts).toEqual({ day: 1, media: 1, moment: 2 })
    expect(out2.results.map((r) => r.kind)).toEqual([
      'moment',
      'moment',
      'day',
      'media',
    ])
  })

  it('needs two characters', () => {
    expect(searchJourney(data, 'j').total).toBe(0)
    expect(searchJourney(data, ' j ').total).toBe(0)
    expect(searchJourney(data, 'jé').total).toBeGreaterThan(0)
  })

  it('requires every term (AND) anywhere in the item', () => {
    expect(searchJourney(data, 'ráno koupání').total).toBe(1)
    expect(searchJourney(data, 'ráno hospoda').total).toBe(0)
    expect(searchJourney(data, 'hotel jezero').results[0]?.id).toBe('m2')
  })

  it('uses the moment title, else the place, as title', () => {
    const out = searchJourney(data, 'jezero')
    expect(out.results[0]?.title).toBe('Hotel Jezero')
    expect(searchJourney(data, 'koupání').results[0]?.title).toBe('Ráno')
  })

  it('computes local dates in the home zone with a 04:00 day start', () => {
    const at = (id: string, startsAt: string) =>
      sm(id, { body: 'noční', startsAt })
    const out = searchJourney(
      {
        ...EMPTY,
        homeTz: 'Europe/Prague',
        moments: [
          at('a', '2026-01-02T23:30:00+00:00'), // 00:30 on 3 Jan -> 2 Jan
          at('b', '2026-01-03T03:30:00+00:00'), // 04:30 on 3 Jan
        ],
      },
      'noční',
    )
    expect(out.results.map((r) => [r.id, r.localDate])).toEqual([
      ['a', '2026-01-02'],
      ['b', '2026-01-03'],
    ])
  })

  it('uses UTC when the home zone is unset', () => {
    const out = searchJourney(
      {
        ...EMPTY,
        moments: [
          sm('a', { body: 'noční', startsAt: '2026-01-03T03:59:00+00:00' }),
        ],
      },
      'noční',
    )
    expect(out.results[0]?.localDate).toBe('2026-01-02')
  })

  it('follows the majority zone of the photo days (zone crossing)', () => {
    const photos = [
      med(1, {
        capturedAt: '2026-01-02T18:00:00+00:00',
        capturedTz: 'America/New_York',
      }),
      med(2, {
        caption: 'noční snímek',
        capturedAt: '2026-01-03T02:00:00+00:00',
        capturedTz: 'Europe/Prague',
      }),
      med(3, {
        capturedAt: '2026-01-02T19:00:00+00:00',
        capturedTz: 'America/New_York',
        status: 'failed',
      }),
    ]
    const out = searchJourney(
      {
        ...EMPTY,
        homeTz: 'Europe/Prague',
        media: photos,
        moments: [
          sm('m', { body: 'noční', startsAt: '2026-01-03T02:00:00+00:00' }),
        ],
      },
      'noční',
    )
    // 02:00Z is 21:00 on 2 Jan in New York (a photo day spent there) and
    // 03:00 on 3 Jan in Prague: the earlier photo day wins.
    expect(out.results.map((r) => [r.kind, r.localDate])).toEqual([
      ['moment', '2026-01-02'],
      ['media', '2026-01-02'],
    ])
  })

  it('gives media without a time the day of their moment', () => {
    const item = med(5, {
      caption: 'bez času',
      capturedAt: null,
      capturedTz: null,
      momentId: '00000000-0000-4000-8000-000000000050',
    })
    const out = searchJourney(
      {
        ...EMPTY,
        media: [item],
        moments: [sm('00000000-0000-4000-8000-000000000050')],
      },
      'čas',
    )
    expect(out.results[0]?.localDate).toBe('2026-01-02')
    const orphan = searchJourney(
      { ...EMPTY, media: [{ ...item, momentId: null }] },
      'čas',
    )
    expect(orphan.results[0]?.localDate).toBeNull()
  })

  it('orders by group, then local date, then id; undated last', () => {
    const d = {
      ...EMPTY,
      moments: [
        sm('b', { body: 'xx', startsAt: '2026-01-05T10:00:00+00:00' }),
        sm('a', { body: 'xx', startsAt: '2026-01-05T11:00:00+00:00' }),
        sm('c', { body: 'xx', startsAt: '2026-01-04T10:00:00+00:00' }),
        sm('z', { body: 'xx', startsAt: 'nonsense' }),
      ],
    }
    expect(searchJourney(d, 'xx').results.map((r) => r.id)).toEqual([
      'c',
      'a',
      'b',
      'z',
    ])
  })

  it('caps results but reports the total', () => {
    const moments = Array.from({ length: 80 }, (_, i) =>
      sm(`m${String(i).padStart(3, '0')}`, { body: 'hory' }),
    )
    const out = searchJourney({ ...EMPTY, moments }, 'hory')
    expect(out.results).toHaveLength(50)
    expect(out.total).toBe(80)
    expect(
      searchJourney({ ...EMPTY, moments }, 'hory', {}, 5).results,
    ).toHaveLength(5)
  })
})

describe('snippets', () => {
  it('cuts about 120 characters around the match with ellipses', () => {
    const body = `${'a '.repeat(100)}Jezero${' b'.repeat(100)}`
    const out = searchJourney(
      { ...EMPTY, moments: [sm('m', { body })] },
      'jezero',
    )
    const snippet = out.results[0]?.snippet ?? ''
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet).toContain('Jezero')
    expect(snippet.length).toBeLessThanOrEqual(124)
    expect(snippet.length).toBeGreaterThan(60)
  })

  it('collapses whitespace and skips ellipses for short text', () => {
    const out = searchJourney(
      { ...EMPTY, moments: [sm('m', { body: 'Pěkné\n\n  Jezero\tdnes' })] },
      'jezero',
    )
    expect(out.results[0]?.snippet).toBe('Pěkné Jezero dnes')
  })

  it('cuts at the original position even when folding changes length', () => {
    const body = `${'x'.repeat(200)} Ježero ${'y'.repeat(200)}`
    const snippet =
      searchJourney({ ...EMPTY, moments: [sm('m', { body })] }, 'jezero')
        .results[0]?.snippet ?? ''
    expect(snippet).toContain('Ježero')
  })
})

describe('filters', () => {
  const media = [
    med(1, { caption: 'Hora', latitude: 1, longitude: 2, starred: true }),
    med(2, { caption: null, kind: 'video' }),
    med(3, { caption: '  ', latitude: 1, longitude: null }),
    med(4, { caption: 'Hora dole', latitude: 1, longitude: 2 }),
  ]
  const data: SearchData = {
    dayNotes: [{ body: 'hora', date: '2026-01-02' }],
    media,
    moments: [sm('m', { body: 'hora' })],
  }

  it('lists media with filters alone, without text', () => {
    expect(
      searchJourney(data, '', { starred: true }).results.map((r) => r.id),
    ).toEqual([media[0]?.id])
    expect(searchJourney(data, '', { video: true }).total).toBe(1)
    expect(searchJourney(data, '', { noLocation: true }).total).toBe(2)
    expect(searchJourney(data, '', { noCaption: true }).total).toBe(2)
  })

  it('lists nothing without text and without filters', () => {
    expect(searchJourney(data, '', {}).total).toBe(0)
    expect(searchJourney(data, 'h', {}).total).toBe(0)
  })

  it('combines filters with each other and with the text (AND)', () => {
    expect(
      searchJourney(data, '', { noLocation: true, video: true }).total,
    ).toBe(1)
    expect(searchJourney(data, 'hora', { starred: true }).total).toBe(1)
    expect(searchJourney(data, 'dole', { starred: true }).total).toBe(0)
  })

  it('with a filter only media are searched', () => {
    const out = searchJourney(data, 'hora', { noCaption: false, starred: true })
    expect(out.counts).toEqual({ day: 0, media: 1, moment: 0 })
  })

  it('short text with a filter still lists the filtered media', () => {
    expect(searchJourney(data, 'h', { video: true }).total).toBe(1)
  })

  it('includes unpublished moments', () => {
    const out = searchJourney(
      { ...EMPTY, moments: [sm('u', { body: 'tajné' })] },
      'tajne',
    )
    expect(out.total).toBe(1)
  })
})

describe('performance', () => {
  it('searches 5000 media and 400 moments quickly', () => {
    const media = Array.from({ length: 5000 }, (_, i) =>
      med(i + 1, {
        caption:
          i % 3 === 0 ? `Pěkný výhled číslo ${String(i)} na jezero` : null,
        starred: i % 7 === 0,
      }),
    )
    const moments = Array.from({ length: 400 }, (_, i) =>
      sm(`m${String(i)}`, {
        body: `${'Dlouhý text o cestě. '.repeat(30)} Ježero ${String(i)}`,
        title: `Zastávka ${String(i)}`,
      }),
    )
    const data: SearchData = { dayNotes: [], media, moments }
    const start = performance.now()
    const out = searchJourney(data, 'jezero výhled', {}, 50)
    const only = searchJourney(data, 'jezero', { starred: true }, 50)
    const elapsed = performance.now() - start
    expect(out.total).toBeGreaterThan(0)
    expect(only.total).toBeGreaterThan(0)
    // Generous: guards against accidental O(n^2), not against a slow CI box.
    expect(elapsed).toBeLessThan(2000)
  })
})
