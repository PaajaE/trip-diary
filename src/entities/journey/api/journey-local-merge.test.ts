import { describe, expect, it } from 'vitest'
import { upsertJourneyEntryFromLocalSave } from '@/entities/journey/api/journey-local-merge'
import { journeyDetailSchema } from '@/entities/journey/model/journey'

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
