import { afterEach, describe, expect, it } from 'vitest'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { saveLocalJourneyLink } from '@/entities/journey/api/local-journey-link.repository'
import { localDb } from '@/shared/lib/local-db'

describe('offline journey assignment remediation', () => {
  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.journeyLinks.clear()
    await localDb.syncOperations.clear()
  })

  it('queues the journey assignment with the offline moment instead of a standalone entry.create', async () => {
    const creatorId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const stageId = crypto.randomUUID()
    const entry = await createLocalEntry(creatorId, crypto.randomUUID(), {
      body: 'Must remain in the journey after reconnecting',
      eventAt: new Date().toISOString(),
      language: 'en',
      title: 'Offline Rockies',
      type: 'story',
      visibility: 'public',
    })
    await saveLocalJourneyLink({
      creatorId,
      entryId: entry.id,
      journeyId,
      stageId,
      stopId: null,
    })

    expect(await localDb.syncOperations.toArray()).toContainEqual(
      expect.objectContaining({
        entryId: entry.id,
        journeyId,
        stageId,
        type: 'journey.assignment.upsert',
      }),
    )
  })
})
