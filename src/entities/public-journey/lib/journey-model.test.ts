import { describe, expect, it } from 'vitest'
import { buildJourneyModel } from '@/entities/public-journey/lib/journey-model'
import {
  FIXTURE_IDS,
  publicJourneyFixture,
} from '@/entities/public-journey/lib/public-journey.fixture'

describe('day notes in the journey model', () => {
  it('indexes the notes by local date', () => {
    const model = buildJourneyModel(publicJourneyFixture)

    expect(model.dayNoteByDate.get('2026-06-02')).toBe('Den u jezera.')
    expect(model.dayNoteByDate.size).toBe(1)
  })

  it('uses the photo-day zone, the 04:00 rule and the home zone (SQL pick_local_day)', () => {
    const first = publicJourneyFixture.moments.find(
      (m) => m.id === FIXTURE_IDS.momentA,
    )
    if (first === undefined) throw new Error('fixture moment missing')
    const model = buildJourneyModel(publicJourneyFixture)
    const photoDays = publicJourneyFixture.media
      .map((m) => m.capturedAt)
      .filter((v): v is string => v !== null)
    expect(photoDays.length).toBeGreaterThan(0)

    // 2026-06-03T02:30Z is 2 June 20:30 in Edmonton (zone of the photo days),
    // but 04:30 on 3 June in Prague (home zone).
    const lateEvening = '2026-06-03T02:30:00+00:00'
    expect(model.dayKeyOf(lateEvening, null)).toBe('2026-06-02')
    // Away from every photo day the home zone applies, with 04:00 day start:
    // 2026-07-10T01:00Z = 03:00 on 10 July in Prague -> 9 July.
    expect(model.dayKeyOf('2026-07-10T01:00:00+00:00')).toBe('2026-07-09')
    expect(model.dayKeyOf('2026-07-10T02:00:00+00:00')).toBe('2026-07-10')
  })

  it('falls back to UTC without a home zone and photos', () => {
    const model = buildJourneyModel({
      ...publicJourneyFixture,
      journey: { ...publicJourneyFixture.journey, homeTz: null },
      media: [],
    })
    expect(model.dayKeyOf('2026-07-10T03:59:00+00:00')).toBe('2026-07-09')
    expect(model.dayKeyOf('2026-07-10T04:00:00+00:00')).toBe('2026-07-10')
  })

  it('keeps a night shot after midnight with the evening it belongs to', () => {
    // 01:00 on 3 June in Edmonton (07:00Z), then the next morning at 09:00.
    const first = publicJourneyFixture.moments.find(
      (m) => m.id === FIXTURE_IDS.momentA,
    )
    if (first === undefined) throw new Error('fixture moment missing')
    const night = {
      ...first,
      id: 'night',
      startsAt: '2026-06-03T07:00:00+00:00',
    }
    const morning = {
      ...first,
      id: 'morning',
      startsAt: '2026-06-03T15:00:00+00:00',
    }
    const model = buildJourneyModel({
      ...publicJourneyFixture,
      media: [],
      moments: [night, morning],
    })
    expect(model.dayOfMoment(night)).toBe('2026-06-02')
    expect(model.dayOfMoment(morning)).toBe('2026-06-03')
  })

  it('groups moments by day and numbers days from the first moment', () => {
    const model = buildJourneyModel(publicJourneyFixture)
    const days = model.daysOfStage(FIXTURE_IDS.stage)

    expect(days.map((d) => d.key)).toEqual([
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
    ])
    expect(days.map((d) => d.number)).toEqual([1, 2, 3])
    expect(days.map((d) => d.note)).toEqual(['Den u jezera.', null, null])
  })
})
