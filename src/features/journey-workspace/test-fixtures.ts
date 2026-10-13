import type { MediaItem } from '@/entities/media/model/media-library'
import type { Moment } from '@/entities/moment/model/moment'
import type { Segment } from '@/entities/segment/model/segment'

const NOW = '2026-01-01T00:00:00+00:00'
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const J = uuid(999)

export function seg(n: number, over: Partial<Segment> = {}): Segment {
  return {
    body: '',
    coverMediaId: null,
    createdAt: NOW,
    endsAt: '2026-01-10T00:00:00+00:00',
    id: uuid(n),
    journeyId: J,
    kind: 'stage',
    origin: 'manual',
    parentId: null,
    position: 0,
    startsAt: '2026-01-01T00:00:00+00:00',
    title: `Segment ${String(n)}`,
    tripType: null,
    tz: 'Europe/Prague',
    updatedAt: NOW,
    ...over,
  }
}

export function mom(n: number, over: Partial<Moment> = {}): Moment {
  return {
    body: '',
    coverMediaId: null,
    createdAt: NOW,
    endsAt: '2026-01-02T11:00:00+00:00',
    id: uuid(n),
    journeyId: J,
    latitude: null,
    locked: false,
    longitude: null,
    origin: 'auto',
    placeId: null,
    published: true,
    startsAt: '2026-01-02T10:00:00+00:00',
    title: null,
    updatedAt: NOW,
    ...over,
  }
}

export function med(n: number, over: Partial<MediaItem> = {}): MediaItem {
  return {
    altitude: null,
    caption: null,
    capturedAt: '2026-01-02T10:00:00+00:00',
    capturedTz: 'Europe/Prague',
    createdAt: NOW,
    durationMs: null,
    focalX: null,
    focalY: null,
    height: 100,
    hideLocation: false,
    id: uuid(n),
    journeyId: J,
    kind: 'photo',
    latitude: null,
    longitude: null,
    momentId: null,
    ownerId: uuid(998),
    segmentOverrideId: null,
    starred: false,
    status: 'ready',
    updatedAt: NOW,
    variants: [],
    width: 100,
    ...over,
  }
}

export function variant(
  mediaId: string,
  kind: MediaItem['variants'][number]['kind'],
  storageKey = `k/${kind}.webp`,
): MediaItem['variants'][number] {
  return {
    byteSize: 10,
    createdAt: NOW,
    height: 10,
    kind,
    mediaId,
    mimeType: kind === 'video' ? 'video/mp4' : 'image/webp',
    storageKey,
    width: 10,
  }
}

export { uuid }
