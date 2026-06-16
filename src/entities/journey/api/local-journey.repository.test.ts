import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalJourney } from '@/entities/journey/api/local-journey.repository'
import { getJourney } from '@/entities/journey/api/journey.repository'
import { localDb } from '@/shared/lib/local-db'
import * as network from '@/shared/lib/network'

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => false),
}))

describe('createLocalJourney', () => {
  beforeEach(() => {
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
  })

  afterEach(async () => {
    await localDb.journeySnapshots.clear()
    await localDb.localJourneys.clear()
    await localDb.syncOperations.clear()
  })

  it('stores a draft journey, sync operation, and readable snapshot', async () => {
    const creatorId = crypto.randomUUID()
    const spaceId = crypto.randomUUID()
    const journeyId = await createLocalJourney(creatorId, spaceId, {
      endsAt: null,
      startsAt: null,
      summary: 'Offline draft',
      title: 'Offline trip',
    })

    const [draft, operation, journey] = await Promise.all([
      localDb.localJourneys.get(journeyId),
      localDb.syncOperations
        .filter((candidate) => candidate.type === 'journey.create')
        .first(),
      getJourney(journeyId),
    ])

    expect(draft).toMatchObject({
      id: journeyId,
      syncStatus: 'pending',
      title: 'Offline trip',
    })
    expect(operation).toMatchObject({
      journeyId,
      status: 'pending',
      type: 'journey.create',
    })
    expect(journey).toMatchObject({
      id: journeyId,
      title: 'Offline trip',
    })
  })
})
