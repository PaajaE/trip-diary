import type { MediaItem } from '@/entities/media/model/media-library'
import type { Moment } from '@/entities/moment/model/moment'
import type { Segment } from '@/entities/segment/model/segment'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'

export const at = (hm: string, day = '05') => `2026-06-${day}T${hm}:00.000Z`

export const HOTEL = { latitude: 52.88, longitude: -118.08 }
export const LAKE = { latitude: 52.7, longitude: -117.6 }
export const PASS = { latitude: 52.69, longitude: -117.58 }

/** Ids of the fixture day (5 June 2026, UTC). */
export const ID = {
  hotel: uuid(10),
  lake: uuid(13),
  locked: uuid(14),
  pass: uuid(12),
  ride: uuid(11),
  trip: uuid(40),
  viewpoint: uuid(15),
}

let mediaSeq = 100

function photos(
  momentId: string | null,
  times: string[],
  place: { latitude: number; longitude: number } | null,
  over: Partial<MediaItem> = {},
): MediaItem[] {
  return times.map((hm) =>
    med((mediaSeq += 1), {
      capturedAt: at(hm),
      capturedTz: 'UTC',
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      momentId,
      reviewedAt: null,
      ...over,
    }),
  )
}

/**
 * Hotel (named, 5 photos) -> ride "Cestou" (3 photos) -> walk trip with a
 * single-photo viewpoint (new, no place) and a lake (4 photos) -> locked
 * pass. Two unplaced photos after the lake (no GPS) and one undated.
 */
export function fixtureDay() {
  mediaSeq = 100
  const moments: Moment[] = [
    mom(10, {
      endsAt: at('07:50'),
      kind: 'stay',
      placeId: uuid(300),
      startsAt: at('07:10'),
    }),
    mom(11, { endsAt: at('08:40'), kind: 'en_route', startsAt: at('08:10') }),
    mom(15, {
      createdAt: '2026-06-05T20:00:00+00:00',
      endsAt: at('10:42'),
      kind: 'point',
      latitude: PASS.latitude,
      longitude: PASS.longitude,
      startsAt: at('10:42'),
    }),
    mom(13, { endsAt: at('12:40'), kind: 'stay', startsAt: at('11:50') }),
    mom(14, {
      endsAt: at('17:00'),
      kind: 'stay',
      locked: true,
      startsAt: at('15:50'),
      title: 'Maligne Lake',
    }),
  ]
  const media: MediaItem[] = [
    ...photos(ID.hotel, ['07:10', '07:20', '07:30', '07:40', '07:50'], HOTEL, {
      reviewedAt: '2026-06-06T08:00:00+00:00',
    }),
    ...photos(ID.ride, ['08:10', '08:25', '08:40'], {
      latitude: 52.8,
      longitude: -117.9,
    }),
    ...photos(ID.viewpoint, ['10:42'], PASS),
    ...photos(ID.lake, ['11:50', '12:05', '12:20', '12:40'], LAKE, {
      createdAt: '2026-06-05T21:00:00+00:00',
    }),
    ...photos(ID.locked, ['15:50', '17:00'], {
      latitude: 52.75,
      longitude: -117.65,
    }),
    ...photos(null, ['12:55', '13:00'], null),
    med((mediaSeq += 1), {
      capturedAt: null,
      momentId: null,
      reviewedAt: null,
    }),
  ]
  const segments: Segment[] = [
    seg(40, {
      endsAt: at('13:00'),
      kind: 'trip',
      origin: 'suggested',
      startsAt: at('10:00'),
      title: 'Túra k jezeru',
      tripType: 'walk',
      tz: 'UTC',
    }),
  ]
  const tree = buildWorkspaceTree(segments, moments, media, 'UTC')
  const placeNames = new Map([[uuid(300), 'Hotel, Jasper']])
  return { media, moments, placeNames, segments, tree }
}
