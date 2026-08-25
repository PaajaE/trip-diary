import { afterEach, describe, expect, it } from 'vitest'
import {
  applyLocalJourneyDeltas,
  patchJourneyEntryText,
  pickJourneyQueryData,
  upsertJourneyEntryFromLocalSave,
} from '@/entities/journey/api/journey-local-merge'
import { journeyDetailSchema } from '@/entities/journey/model/journey'
import { localDb } from '@/shared/lib/local-db'

const journeyId = crypto.randomUUID()

function buildJourney() {
  return journeyDetailSchema.parse({
    endsAt: null,
    entries: [],
    guides: [],
    id: journeyId,
    stages: [],
    startsAt: null,
    status: 'active',
    stops: [],
    spaceId: crypto.randomUUID(),
    summary: 'Cached fixture',
    title: 'Cached trip',
  })
}

describe('pickJourneyQueryData', () => {
  it('prefers the journey with more entries', () => {
    const withMoment = upsertJourneyEntryFromLocalSave(buildJourney(), {
      body: 'Saved offline',
      entryId: crypto.randomUUID(),
      entrySlug: 'offline-moment',
      entryTitle: 'Offline moment',
      eventAt: '2026-07-04T12:00:00+00:00',
      type: 'story',
    })

    expect(
      pickJourneyQueryData(buildJourney(), withMoment)?.entries,
    ).toHaveLength(1)
    expect(
      pickJourneyQueryData(withMoment, buildJourney())?.entries,
    ).toHaveLength(1)
  })
})

describe('upsertJourneyEntryFromLocalSave', () => {
  it('adds a pending local moment to an empty cached journey', () => {
    const entryId = crypto.randomUUID()
    const journey = upsertJourneyEntryFromLocalSave(buildJourney(), {
      body: 'Saved offline',
      entryId,
      entrySlug: 'offline-moment',
      entryTitle: 'Offline moment',
      eventAt: '2026-07-04T12:00:00+00:00',
      type: 'story',
    })

    expect(journey.entries).toEqual([
      expect.objectContaining({
        body: 'Saved offline',
        id: entryId,
        syncStatus: 'pending',
        title: 'Offline moment',
      }),
    ])
  })

  it('replaces an existing entry with the same id', () => {
    const entryId = crypto.randomUUID()
    const journey = upsertJourneyEntryFromLocalSave(
      upsertJourneyEntryFromLocalSave(buildJourney(), {
        body: 'First body',
        entryId,
        entrySlug: 'offline-moment',
        entryTitle: 'First title',
        eventAt: '2026-07-04T12:00:00+00:00',
        type: 'story',
      }),
      {
        body: 'Updated body',
        entryId,
        entrySlug: 'offline-moment',
        entryTitle: 'Offline moment',
        eventAt: '2026-07-04T12:00:00+00:00',
        type: 'story',
      },
    )

    expect(journey.entries).toHaveLength(1)
    expect(journey.entries[0]).toMatchObject({
      body: 'Updated body',
      id: entryId,
      title: 'Offline moment',
    })
  })
})

describe('patchJourneyEntryText', () => {
  it('updates title and body without touching stage, stop, or event time', () => {
    const entryId = crypto.randomUUID()
    const stageId = crypto.randomUUID()
    const stopId = crypto.randomUUID()
    const journey = journeyDetailSchema.parse({
      ...buildJourney(),
      entries: [
        {
          body: 'Original body',
          eventAt: '2026-07-04T12:00:00+00:00',
          id: entryId,
          slug: 'original-slug',
          stageId,
          stopId,
          syncStatus: 'synced',
          title: 'Original title',
          type: 'story',
        },
      ],
      stages: [{ id: stageId, summary: '', title: 'Day 1' }],
      stops: [
        {
          id: stopId,
          mapLatitude: 49.2,
          mapLongitude: 16.6,
          notes: '',
          stageId,
          status: 'visited',
          title: 'Brno',
        },
      ],
    })

    const patched = patchJourneyEntryText(journey, {
      body: 'Edited body with ěščř ⛰',
      entryId,
      slug: 'original-slug',
      syncStatus: 'pending',
      title: 'Edited title',
    })

    expect(patched.entries).toEqual([
      expect.objectContaining({
        body: 'Edited body with ěščř ⛰',
        eventAt: '2026-07-04T12:00:00+00:00',
        id: entryId,
        stageId,
        stopId,
        syncStatus: 'pending',
        title: 'Edited title',
        type: 'story',
      }),
    ])
    expect(patched.stops).toEqual(journey.stops)
    expect(patched.stages).toEqual(journey.stages)
    expect(patched.entries[0]?.type).toBe('story')
    expect(patched.entries[0]?.eventAt).toBe('2026-07-04T12:00:00+00:00')
  })
})

describe('applyLocalJourneyDeltas entry text overlay', () => {
  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.journeyLinks.clear()
  })

  it('keeps pending local body and title over the remote snapshot', async () => {
    const entryId = crypto.randomUUID()
    const journey = journeyWithEntry(entryId, {
      body: 'Remote body',
      title: 'Remote title',
    })
    await putLocalEntry(entryId, {
      body: 'Pending local body',
      syncStatus: 'pending',
      title: 'Pending local title',
    })

    const merged = await applyLocalJourneyDeltas(journey)

    expect(merged.entries[0]).toMatchObject({
      body: 'Pending local body',
      title: 'Pending local title',
    })
  })

  it('does not let a stale synced Dexie row shadow newer remote text', async () => {
    const entryId = crypto.randomUUID()
    const journey = journeyWithEntry(entryId, {
      body: 'Server body after edit',
      title: 'Server title after edit',
    })
    await putLocalEntry(entryId, {
      body: 'Stale Dexie body',
      syncStatus: 'synced',
      title: 'Stale Dexie title',
    })

    const merged = await applyLocalJourneyDeltas(journey)

    expect(merged.entries[0]).toMatchObject({
      body: 'Server body after edit',
      title: 'Server title after edit',
    })
  })
})

function journeyWithEntry(
  entryId: string,
  fields: { body: string; title: string },
) {
  return journeyDetailSchema.parse({
    ...buildJourney(),
    entries: [
      {
        body: fields.body,
        eventAt: '2026-06-01T12:00:00+00:00',
        id: entryId,
        slug: null,
        stageId: null,
        stopId: null,
        title: fields.title,
        type: 'story',
      },
    ],
  })
}

async function putLocalEntry(
  entryId: string,
  fields: { body: string; syncStatus: 'pending' | 'synced'; title: string },
) {
  const now = new Date().toISOString()
  await localDb.entries.put({
    body: fields.body,
    createdAt: now,
    creatorId: crypto.randomUUID(),
    eventAt: now,
    id: entryId,
    language: 'cs',
    publishedAt: now,
    slug: 'local-entry',
    spaceId: crypto.randomUUID(),
    status: 'published',
    syncStatus: fields.syncStatus,
    title: fields.title,
    type: 'story',
    updatedAt: now,
    version: 1,
    visibility: 'public',
  })
}
