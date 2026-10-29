import { describe, expect, it } from 'vitest'
import {
  buildFlowDays,
  type FlowDay,
} from '@/features/journey-flow/model/flow-days'
import {
  addRun,
  EMPTY_MARKERS,
  markStopOpened,
} from '@/features/journey-flow/model/flow-markers'
import {
  buildStopReview,
  previousStopId,
  splitPreview,
  suggestedSplitId,
  transitBetween,
  type ReviewCard,
} from '@/features/journey-flow/model/stop-review'
import { at, fixtureDay, ID } from '@/features/journey-flow/test-fixtures'

const markers = addRun(EMPTY_MARKERS, 'r', [ID.viewpoint])

function day(): FlowDay {
  const { placeNames, tree } = fixtureDay()
  const found = buildFlowDays({ homeTz: 'UTC', markers, placeNames, tree })
    .days[0]
  if (found === undefined) throw new Error('no day')
  return found
}

function shape(cards: readonly ReviewCard[]): unknown[] {
  return cards.map((card) => {
    switch (card.kind) {
      case 'stop':
        return `stop ${String(card.number)}`
      case 'enRoute':
        return `ride ${String(card.mediaCount)}`
      case 'transit':
        return card.hint.kind === 'move'
          ? `move ${card.hint.mode} ${String(card.hint.distanceKm)} km`
          : `pause ${String(card.hint.durationMs / 60_000)} min`
      case 'trip':
        return { trip: card.trip.title, cards: shape(card.cards) }
    }
  })
}

describe('buildStopReview', () => {
  it('lays out stops, the ride, the trip and transit facts in time order', () => {
    const model = buildStopReview(day(), markers)
    expect(shape(model.cards)).toEqual([
      'stop 1',
      // 40 km in almost 3 h: the mode is unclear, so the neutral "Přesun"
      // (a ride is never assumed to be a car).
      'move transit 39.7 km',
      'ride 3',
      {
        cards: ['stop 2', 'move walk 1.7 km', 'stop 3'],
        trip: 'Túra k jezeru',
      },
      // 6.5 km in 3 h 10 min says nothing sure about the mode.
      'move transit 6.5 km',
      'stop 4',
    ])
    expect(model.stopCount).toBe(4)
    // The ride is confirmed with the rest; the locked stop needs nothing.
    expect(model.confirmIds).toEqual([ID.hotel, ID.ride, ID.viewpoint, ID.lake])
    expect(model.unassigned).toEqual({ copies: 0, media: 2 })
  })

  it('says "kolem" for one photo and gives a range otherwise', () => {
    const model = buildStopReview(day(), markers, 'toCheck')
    expect(model.cards).toHaveLength(1)
    const card = model.cards[0]
    expect(card?.kind === 'stop' && card.time).toEqual({
      at: at('10:42'),
      kind: 'around',
      tz: 'UTC',
    })
    const hotel = buildStopReview(day(), markers).cards[0]
    expect(hotel?.kind === 'stop' && hotel.time).toEqual({
      from: at('07:10'),
      kind: 'range',
      to: at('07:50'),
      tz: 'UTC',
    })
  })

  it('counts the to-check stops not opened yet', () => {
    expect(buildStopReview(day(), markers).unopenedToCheck).toEqual([
      ID.viewpoint,
    ])
    const opened = markStopOpened(markers, ID.viewpoint)
    expect(buildStopReview(day(), opened).unopenedToCheck).toEqual([])
  })

  it('finds the previous stop for merging (rides do not count)', () => {
    expect(previousStopId(day(), ID.viewpoint)).toBe(ID.hotel)
    expect(previousStopId(day(), ID.hotel)).toBeNull()
  })
})

describe('transitBetween', () => {
  const A = { latitude: 52.7, longitude: -117.6 }
  it('reports a pause without movement and nothing for a short one', () => {
    expect(
      transitBetween(
        { centre: A, endsAt: at('12:00') },
        { centre: A, startsAt: at('12:50') },
      ),
    ).toEqual({
      durationMs: 50 * 60_000,
      from: at('12:00'),
      kind: 'pause',
      to: at('12:50'),
    })
    expect(
      transitBetween(
        { centre: A, endsAt: at('12:00') },
        { centre: A, startsAt: at('12:05') },
      ),
    ).toBeNull()
    expect(
      transitBetween(
        { centre: null, endsAt: at('12:00') },
        { centre: A, startsAt: at('13:00') },
      ),
    ).toBeNull()
  })
})

describe('split preview', () => {
  it('cuts before the chosen photo and reports the pause', () => {
    const lake = day().stops.find((s) => s.id === ID.lake)
    if (lake === undefined) throw new Error('no lake')
    const third = lake.media[2]
    const preview = splitPreview(lake, third?.id ?? '')
    expect(preview?.at).toBe(at('12:20'))
    expect(preview?.before.mediaIds).toHaveLength(2)
    expect(preview?.after.mediaIds).toHaveLength(2)
    expect(preview?.pauseMs).toBe(15 * 60_000)
    expect(splitPreview(lake, lake.media[0]?.id ?? '')).toBeNull()
    expect(suggestedSplitId(lake)).toBe(lake.media[3]?.id)
  })

  it('labels a ride by the mode of its stretch only', () => {
    const model = buildStopReview(day(), markers)
    const ride = model.cards.find((card) => card.kind === 'enRoute')
    expect(ride?.kind === 'enRoute' && ride.mode).toBe('transit')
  })

  it('times a stop by the photos it still holds, not its stored range', () => {
    const { placeNames, tree } = fixtureDay()
    const lake = tree.roots[0]?.moments.find((m) => m.moment.id === ID.lake)
    if (lake === undefined) throw new Error('no lake')
    // The 12:40 photo went to the trash: the stored range still ends 12:40.
    lake.media = lake.media.slice(0, 3)
    const flowDay = buildFlowDays({
      homeTz: 'UTC',
      markers,
      placeNames,
      tree,
    }).days[0]
    if (flowDay === undefined) throw new Error('no day')
    const card = buildStopReview(flowDay, markers, 'all')
      .cards.flatMap((c) => (c.kind === 'trip' ? c.cards : [c]))
      .find((c) => c.kind === 'stop' && c.stop.id === ID.lake)
    expect(card?.kind === 'stop' && card.time).toEqual({
      from: at('11:50'),
      kind: 'range',
      to: at('12:20'),
      tz: 'UTC',
    })
  })

  it('does not confirm a stop that no longer holds photos', () => {
    const { placeNames, tree } = fixtureDay()
    const hotel = tree.looseMoments.find((m) => m.moment.id === ID.hotel)
    if (hotel === undefined) throw new Error('no hotel')
    hotel.media = []
    const flowDay = buildFlowDays({ homeTz: 'UTC', markers, placeNames, tree })
      .days[0]
    if (flowDay === undefined) throw new Error('no day')
    expect(buildStopReview(flowDay, markers).confirmIds).not.toContain(ID.hotel)
  })
})
