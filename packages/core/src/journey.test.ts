import { describe, expect, it } from 'vitest'
import {
  journeyHeaderSchema,
  journeyListItemSchema,
  journeyStatusSchema,
  journeyStopSchema,
  parseJourneyHeaderFromRemoteRecord,
  parseJourneyListItemFromRemoteRecord,
  parseJourneyStopFromRemoteRecord,
  safeParseJourneyHeaderPayload,
  safeParseJourneyListItemPayload,
  safeParseJourneyStopPayload,
  serializeJourneyHeaderToLegacyCachePayload,
  serializeJourneyListItemToLegacyCachePayload,
} from './journey.ts'

const listItem = {
  endsAt: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  startsAt: '2026-07-10',
  status: 'active' as const,
  summary: 'Coastal route',
  title: 'Summer trip',
  updatedAt: '2026-07-10T08:00:00.000+00:00',
}

const legacyListCachePayload = {
  ends_at: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  starts_at: '2026-07-10',
  status: 'active',
  summary: 'Coastal route',
  title: 'Summer trip',
  updated_at: '2026-07-10T08:00:00.000+00:00',
}

const legacyDetailCachePayload = {
  ends_at: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  starts_at: '2026-07-10',
  status: 'planning',
  summary: 'Coastal route',
  title: 'Summer trip',
}

describe('journeyStatusSchema', () => {
  it('accepts every current production status', () => {
    for (const status of ['planning', 'active', 'completed'] as const) {
      expect(journeyStatusSchema.safeParse(status).success).toBe(true)
    }
  })

  it('rejects unknown statuses', () => {
    expect(journeyStatusSchema.safeParse('draft').success).toBe(false)
  })
})

describe('journeyListItemSchema', () => {
  it('accepts a complete list item', () => {
    expect(journeyListItemSchema.parse(listItem)).toEqual(listItem)
  })

  it('accepts nullable summary and dates', () => {
    expect(
      journeyListItemSchema.parse({
        ...listItem,
        endsAt: null,
        startsAt: null,
        summary: null,
      }),
    ).toMatchObject({
      endsAt: null,
      startsAt: null,
      summary: null,
    })
  })

  it('rejects malformed ids, titles, statuses, and dates', () => {
    expect(
      journeyListItemSchema.safeParse({ ...listItem, id: 'not-a-uuid' }).success,
    ).toBe(false)
    expect(
      journeyListItemSchema.safeParse({ ...listItem, title: '' }).success,
    ).toBe(false)
    expect(
      journeyListItemSchema.safeParse({ ...listItem, status: 'draft' }).success,
    ).toBe(false)
    expect(
      journeyListItemSchema.safeParse({ ...listItem, startsAt: '07-10-2026' })
        .success,
    ).toBe(false)
  })

  it('strips unknown extra fields during parse', () => {
    expect(
      journeyListItemSchema.parse({
        ...listItem,
        cached_at: '2026-07-10T08:00:00.000+00:00',
      }),
    ).toEqual(listItem)
  })
})

describe('journeyHeaderSchema', () => {
  it('accepts the current mobile and web detail header shape', () => {
    expect(
      journeyHeaderSchema.parse({
        endsAt: null,
        id: listItem.id,
        startsAt: '2026-07-10',
        status: 'completed',
        summary: '',
        title: 'Summer trip',
      }),
    ).toMatchObject({
      summary: '',
      status: 'completed',
    })
  })

  it('rejects missing required fields', () => {
    expect(
      journeyHeaderSchema.safeParse({
        id: listItem.id,
        title: 'Summer trip',
      }).success,
    ).toBe(false)
  })
})

describe('journeyStopSchema', () => {
  it('accepts valid coordinates and optional ordering metadata', () => {
    expect(
      journeyStopSchema.parse({
        id: '22222222-2222-4222-8222-222222222222',
        mapLatitude: 49.1951,
        mapLongitude: 16.6068,
        notes: 'Brno',
        position: 0,
        stageId: null,
        status: 'planned',
        title: 'Stop 1',
      }),
    ).toMatchObject({
      mapLatitude: 49.1951,
      position: 0,
    })
  })

  it('accepts boundary coordinates', () => {
    expect(
      journeyStopSchema.safeParse({
        id: '22222222-2222-4222-8222-222222222222',
        mapLatitude: -90,
        mapLongitude: 180,
        stageId: null,
        status: 'visited',
        title: 'Edge',
      }).success,
    ).toBe(true)
  })

  it('rejects invalid latitude and longitude values', () => {
    expect(
      journeyStopSchema.safeParse({
        id: '22222222-2222-4222-8222-222222222222',
        mapLatitude: 91,
        mapLongitude: 0,
        stageId: null,
        status: 'planned',
        title: 'Too far north',
      }).success,
    ).toBe(false)
    expect(
      journeyStopSchema.safeParse({
        id: '22222222-2222-4222-8222-222222222222',
        mapLatitude: 0,
        mapLongitude: -181,
        stageId: null,
        status: 'planned',
        title: 'Too far west',
      }).success,
    ).toBe(false)
  })
})

describe('remote and legacy cache mapping', () => {
  it('maps snake_case Supabase list rows into domain list items', () => {
    expect(parseJourneyListItemFromRemoteRecord(legacyListCachePayload)).toEqual(
      listItem,
    )
  })

  it('reads legacy mobile list cache payloads unchanged', () => {
    expect(safeParseJourneyListItemPayload(legacyListCachePayload)).toEqual(
      listItem,
    )
  })

  it('reads legacy mobile detail cache payloads unchanged', () => {
    expect(safeParseJourneyHeaderPayload(legacyDetailCachePayload)).toEqual({
      endsAt: '2026-07-20',
      id: listItem.id,
      startsAt: '2026-07-10',
      status: 'planning',
      summary: 'Coastal route',
      title: 'Summer trip',
    })
  })

  it('serializes domain list and detail payloads back to legacy cache shape', () => {
    expect(serializeJourneyListItemToLegacyCachePayload(listItem)).toEqual(
      legacyListCachePayload,
    )
    expect(
      serializeJourneyHeaderToLegacyCachePayload({
        endsAt: '2026-07-20',
        id: listItem.id,
        startsAt: '2026-07-10',
        status: 'planning',
        summary: 'Coastal route',
        title: 'Summer trip',
      }),
    ).toEqual(legacyDetailCachePayload)
  })

  it('maps snake_case stop rows into shared stop objects', () => {
    expect(
      parseJourneyStopFromRemoteRecord({
        id: '22222222-2222-4222-8222-222222222222',
        map_latitude: 49.2,
        map_longitude: 16.6,
        notes: 'Brno',
        position: 1,
        stage_id: null,
        status: 'visited',
        title: 'Brno',
      }),
    ).toMatchObject({
      mapLatitude: 49.2,
      position: 1,
      status: 'visited',
    })
  })

  it('returns null for malformed cached payloads without throwing', () => {
    expect(safeParseJourneyListItemPayload(null)).toBeNull()
    expect(safeParseJourneyListItemPayload({ id: 'only-id' })).toBeNull()
    expect(safeParseJourneyHeaderPayload('{not-json')).toBeNull()
    expect(
      safeParseJourneyStopPayload({
        id: '22222222-2222-4222-8222-222222222222',
        mapLatitude: 120,
        mapLongitude: 0,
        stageId: null,
        status: 'planned',
        title: 'Bad coords',
      }),
    ).toBeNull()
  })

  it('maps remote detail rows from Supabase', () => {
    expect(
      parseJourneyHeaderFromRemoteRecord({
        ends_at: null,
        id: listItem.id,
        starts_at: null,
        status: 'active',
        summary: '',
        title: 'Trip',
      }),
    ).toEqual({
      endsAt: null,
      id: listItem.id,
      startsAt: null,
      status: 'active',
      summary: '',
      title: 'Trip',
    })
  })
})
