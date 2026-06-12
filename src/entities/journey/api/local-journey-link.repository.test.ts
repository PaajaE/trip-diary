import { afterEach, describe, expect, it } from 'vitest'
import {
  listLocalJourneyLinks,
  saveLocalJourneyLink,
} from '@/entities/journey/api/local-journey-link.repository'
import { localDb } from '@/shared/lib/local-db'

describe('local journey link repository', () => {
  afterEach(async () => {
    await localDb.journeyLinks.clear()
    await localDb.syncOperations.clear()
  })

  it('stores the overlay and its own outbox operation atomically', async () => {
    const creatorId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const stageId = crypto.randomUUID()

    await saveLocalJourneyLink({
      creatorId,
      entryId,
      journeyId,
      stageId,
      stopId: null,
    })

    await expect(listLocalJourneyLinks(journeyId)).resolves.toMatchObject([
      { creatorId, entryId, journeyId, stageId, stopId: null },
    ])
    await expect(localDb.syncOperations.toArray()).resolves.toMatchObject([
      {
        creatorId,
        entryId,
        journeyId,
        stageId,
        status: 'pending',
        stopId: null,
        type: 'journey.assignment.upsert',
      },
    ])
  })

  it('keeps only the newest assignment and operation for an entry', async () => {
    const creatorId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const firstJourneyId = crypto.randomUUID()
    const secondJourneyId = crypto.randomUUID()

    await saveLocalJourneyLink({
      creatorId,
      entryId,
      journeyId: firstJourneyId,
      stageId: null,
      stopId: null,
    })
    await saveLocalJourneyLink({
      creatorId,
      entryId,
      journeyId: secondJourneyId,
      stageId: null,
      stopId: null,
    })

    await expect(localDb.journeyLinks.toArray()).resolves.toMatchObject([
      { entryId, journeyId: secondJourneyId },
    ])
    await expect(localDb.syncOperations.toArray()).resolves.toMatchObject([
      {
        entryId,
        journeyId: secondJourneyId,
        type: 'journey.assignment.upsert',
      },
    ])
  })

  it('stores a selected location with the journey assignment', async () => {
    const creatorId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const stopId = crypto.randomUUID()

    await saveLocalJourneyLink({
      creatorId,
      entryId,
      journeyId,
      latitude: 51.18,
      locationTitle: 'Banff',
      longitude: -115.57,
      stageId: null,
      stopId,
    })

    await expect(localDb.journeyLinks.get(entryId)).resolves.toMatchObject({
      latitude: 51.18,
      locationTitle: 'Banff',
      longitude: -115.57,
      stopId,
    })
    await expect(localDb.syncOperations.toArray()).resolves.toMatchObject([
      {
        latitude: 51.18,
        locationTitle: 'Banff',
        longitude: -115.57,
        stopId,
        type: 'journey.assignment.upsert',
      },
    ])
  })
})
