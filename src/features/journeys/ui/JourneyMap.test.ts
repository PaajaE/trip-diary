import { describe, expect, it } from 'vitest'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { NatureObservation } from '@/entities/nature/model/observation'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { getJourneyMapPoints } from '@/features/journeys/ui/journey-map-points'

describe('getJourneyMapPoints', () => {
  it('creates typed moment and planned points', () => {
    const moment = createMoment()
    const plannedStop = createStop({ title: 'Next camp' })

    expect(getJourneyMapPoints([moment], [plannedStop])).toEqual([
      {
        category: null,
        checked: false,
        checklistItemId: null,
        entryId: moment.entry.id,
        id: `moment:${moment.entry.id}`,
        latitude: 50,
        longitude: 14,
        notes: '',
        photoId: null,
        stopId: moment.stop?.id ?? null,
        title: 'Morning view',
        type: 'moment',
      },
      {
        category: null,
        checked: false,
        checklistItemId: null,
        entryId: null,
        id: `planned:${plannedStop.id}`,
        latitude: 50,
        longitude: 14,
        notes: '',
        photoId: null,
        stopId: plannedStop.id,
        title: 'Next camp',
        type: 'planned',
      },
    ])
  })

  it('prefers photo pins over a moment marker for the same entry', () => {
    const moment = createMoment()
    const photo = {
      entryId: moment.entry.id,
      entryTitle: moment.entry.title,
      id: crypto.randomUUID(),
      latitude: 50.1,
      longitude: 14.1,
    }

    expect(getJourneyMapPoints([moment], [], [photo])).toEqual([
      {
        category: null,
        checked: false,
        checklistItemId: null,
        entryId: moment.entry.id,
        id: `photo:${photo.id}`,
        latitude: 50.1,
        longitude: 14.1,
        notes: '',
        photoId: photo.id,
        stopId: null,
        title: 'Morning view',
        type: 'photo',
      },
    ])
  })

  it('creates nature-goal pins for checklist-linked stops with observation photos', () => {
    const stop = createStop({ title: 'Peregrine cliff' })
    const checklistItem = createChecklistItem({
      stopId: stop.id,
      title: 'Peregrine falcon',
    })
    const observation = createObservation({
      checklistItemId: checklistItem.id,
      photoId: crypto.randomUUID(),
    })

    expect(
      getJourneyMapPoints([], [stop], [], {
        checklistItems: [checklistItem],
        observations: [observation],
      }),
    ).toEqual([
      {
        category: 'wildlife',
        checked: false,
        checklistItemId: checklistItem.id,
        entryId: null,
        id: `nature-goal:${checklistItem.id}`,
        latitude: 50,
        longitude: 14,
        notes: 'Look up at the cliffs',
        photoId: observation.photoId,
        stopId: stop.id,
        title: 'Peregrine falcon',
        type: 'nature-goal',
      },
    ])
  })

  it('deduplicates repeated content and gives a linked moment priority over its stop', () => {
    const moment = createMoment()
    const linkedStop = moment.stop

    expect(
      getJourneyMapPoints(
        [moment, moment],
        linkedStop === null ? [] : [linkedStop, linkedStop],
      ),
    ).toMatchObject([
      {
        entryId: moment.entry.id,
        type: 'moment',
      },
    ])
  })

  it('keeps separate photo pins at the same coordinates', () => {
    const photoA = {
      entryId: crypto.randomUUID(),
      entryTitle: 'First shot',
      id: crypto.randomUUID(),
      latitude: 50,
      longitude: 14,
    }
    const photoB = {
      entryId: crypto.randomUUID(),
      entryTitle: 'Second shot',
      id: crypto.randomUUID(),
      latitude: 50,
      longitude: 14,
    }

    expect(getJourneyMapPoints([], [], [photoA, photoB])).toEqual([
      {
        category: null,
        checked: false,
        checklistItemId: null,
        entryId: photoA.entryId,
        id: `photo:${photoA.id}`,
        latitude: 50,
        longitude: 14,
        notes: '',
        photoId: photoA.id,
        stopId: null,
        title: 'First shot',
        type: 'photo',
      },
      {
        category: null,
        checked: false,
        checklistItemId: null,
        entryId: photoB.entryId,
        id: `photo:${photoB.id}`,
        latitude: 50,
        longitude: 14,
        notes: '',
        photoId: photoB.id,
        stopId: null,
        title: 'Second shot',
        type: 'photo',
      },
    ])
  })

  it('ignores points without finite coordinates', () => {
    const invalidMoment = createMoment({
      location: { latitude: Number.NaN, longitude: 14 },
    })
    const invalidStop = createStop({ mapLatitude: null })

    expect(getJourneyMapPoints([invalidMoment], [invalidStop])).toEqual([])
  })
})

function createMoment(overrides: Partial<JourneyMoment> = {}): JourneyMoment {
  const stop = createStop({ status: 'visited', title: 'Morning view' })

  return {
    entry: {
      body: '',
      eventAt: null,
      id: crypto.randomUUID(),
      slug: null,
      stageId: null,
      stopId: stop.id,
      title: 'Morning view',
      type: 'story',
    },
    location: { latitude: 50, longitude: 14 },
    stop,
    ...overrides,
  }
}

function createStop(
  overrides: Partial<JourneyDetail['stops'][number]> = {},
): JourneyDetail['stops'][number] {
  return {
    id: crypto.randomUUID(),
    mapLatitude: 50,
    mapLongitude: 14,
    notes: '',
    stageId: null,
    status: 'planned',
    title: 'Planned stop',
    ...overrides,
  }
}

function createChecklistItem(
  overrides: Partial<JourneyChecklistItem> = {},
): JourneyChecklistItem {
  return {
    category: 'wildlife',
    checkedAt: null,
    entryId: null,
    id: crypto.randomUUID(),
    itemSlug: 'peregrine',
    notes: 'Look up at the cliffs',
    position: 0,
    stopId: null,
    templateSlug: 'ceske-svycarsko',
    title: 'Peregrine falcon',
    ...overrides,
  }
}

function createObservation(
  overrides: Partial<NatureObservation> = {},
): NatureObservation {
  return {
    category: 'wildlife',
    checklistItemId: crypto.randomUUID(),
    commonName: 'Peregrine falcon',
    confidence: 'seen',
    entryId: null,
    externalId: null,
    externalSource: null,
    id: crypto.randomUUID(),
    journeyId: crypto.randomUUID(),
    latitude: null,
    longitude: null,
    notes: '',
    observedAt: null,
    photoId: null,
    scientificName: null,
    ...overrides,
  }
}
