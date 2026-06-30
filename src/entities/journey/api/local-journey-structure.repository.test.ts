import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addJourneyStage } from '@/entities/journey/api/local-journey-structure.repository'
import { saveJourneySnapshot } from '@/entities/journey/api/local-journey-cache.repository'
import { applyLocalJourneyDeltas } from '@/entities/journey/api/journey-local-merge'
import { journeyDetailSchema } from '@/entities/journey/model/journey'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import * as network from '@/shared/lib/network'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => false),
}))

describe('local journey structure offline', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset()
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
  })

  afterEach(async () => {
    await localDb.journeySnapshots.clear()
    await localDb.localJourneyGuides.clear()
    await localDb.localJourneyStages.clear()
    await localDb.localJourneyStops.clear()
    await localDb.syncOperations.clear()
  })

  it('queues a stage and merges it into the journey snapshot', async () => {
    const creatorId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const journey = journeyDetailSchema.parse({
      endsAt: null,
      entries: [],
      guides: [],
      id: journeyId,
      stages: [],
      startsAt: null,
      status: 'active',
      stops: [],
      spaceId: crypto.randomUUID(),
      summary: 'Cached trip',
      title: 'Offline structure trip',
    })

    await saveJourneySnapshot(journey, true)
    await addJourneyStage(creatorId, journeyId, 'Day 3 — Rockies')

    expect(getSupabaseClient).not.toHaveBeenCalled()
    expect(await localDb.syncOperations.toArray()).toContainEqual(
      expect.objectContaining({
        journeyId,
        type: 'stage.create',
      }),
    )

    const merged = await applyLocalJourneyDeltas(journey)
    expect(merged.stages).toContainEqual(
      expect.objectContaining({
        title: 'Day 3 — Rockies',
      }),
    )
  })

  it('removes a pending stage locally without queueing stage.delete', async () => {
    const creatorId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const journey = journeyDetailSchema.parse({
      endsAt: null,
      entries: [],
      guides: [],
      id: journeyId,
      stages: [],
      startsAt: null,
      status: 'active',
      stops: [],
      spaceId: crypto.randomUUID(),
      summary: 'Cached trip',
      title: 'Offline structure trip',
    })

    await saveJourneySnapshot(journey, true)
    await addJourneyStage(creatorId, journeyId, 'Temporary stage')
    const stageId = (await localDb.localJourneyStages.toArray())[0]?.id
    expect(stageId).toBeDefined()
    if (stageId === undefined) {
      throw new Error('Expected stage id')
    }

    const { deleteJourneyStage } =
      await import('@/entities/journey/api/local-journey-structure.repository')
    await deleteJourneyStage(creatorId, journeyId, stageId)

    expect(await localDb.syncOperations.toArray()).toHaveLength(0)
    const merged = await applyLocalJourneyDeltas(journey)
    expect(merged.stages).toHaveLength(0)
  })
})
