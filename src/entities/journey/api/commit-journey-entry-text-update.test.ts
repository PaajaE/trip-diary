import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import { commitJourneyEntryTextUpdate } from '@/entities/journey/api/commit-journey-entry-text-update'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { getJourneySnapshot } from '@/entities/journey/api/local-journey-cache.repository'
import { journeyDetailSchema } from '@/entities/journey/model/journey'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import type { Entry } from '@/entities/entry/model/entry'
import { localDb } from '@/shared/lib/local-db'

const journeyId = crypto.randomUUID()
const entryId = crypto.randomUUID()
const stageId = crypto.randomUUID()
const stopId = crypto.randomUUID()

function buildJourney() {
  return journeyDetailSchema.parse({
    endsAt: null,
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
    guides: [],
    id: journeyId,
    stages: [{ id: stageId, summary: '', title: 'Day 1' }],
    startsAt: null,
    status: 'active',
    stops: [
      {
        id: stopId,
        mapLatitude: 49.1951,
        mapLongitude: 16.6068,
        notes: '',
        stageId,
        status: 'visited',
        title: 'Brno',
      },
    ],
    spaceId: crypto.randomUUID(),
    summary: 'Cached trip',
    title: 'Cached trip',
  })
}

function buildUpdatedEntry(): Entry {
  const now = new Date().toISOString()
  return {
    body: 'Saved body',
    createdAt: now,
    creatorId: crypto.randomUUID(),
    eventAt: '2026-07-04T12:00:00+00:00',
    id: entryId,
    language: 'cs',
    publishedAt: now,
    slug: 'original-slug',
    spaceId: crypto.randomUUID(),
    status: 'published',
    syncStatus: 'synced',
    title: 'Saved title',
    type: 'story',
    updatedAt: now,
    version: 2,
    visibility: 'public',
  }
}

describe('commitJourneyEntryTextUpdate', () => {
  afterEach(async () => {
    await localDb.journeySnapshots.clear()
  })

  it('patches cached journey text immediately without dropping place metadata', async () => {
    const queryClient = new QueryClient()
    const journey = buildJourney()
    queryClient.setQueryData(journeyQueryKeys.detail(journeyId), journey)
    queryClient.setQueryData(journeyQueryKeys.detailLocal(journeyId), journey)

    const updated = buildUpdatedEntry()
    await commitJourneyEntryTextUpdate(queryClient, { journeyId, updated })

    const patched = queryClient.getQueryData(journeyQueryKeys.detail(journeyId))
    expect(patched).toMatchObject({
      entries: [
        expect.objectContaining({
          body: 'Saved body',
          stageId,
          stopId,
          title: 'Saved title',
        }),
      ],
    })
    expect(
      queryClient.getQueryData(journeyQueryKeys.detailLocal(journeyId)),
    ).toEqual(patched)
    expect(queryClient.getQueryData(entryQueryKeys.detail(entryId))).toEqual(
      updated,
    )

    const snapshot = await getJourneySnapshot(journeyId)
    expect(snapshot?.journey.entries[0]).toMatchObject({
      body: 'Saved body',
      stopId,
      title: 'Saved title',
    })
  })
})
