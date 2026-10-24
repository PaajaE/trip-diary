import { describe, expect, it } from 'vitest'
import {
  planLocationUndo,
  snapshotLocations,
} from '@/features/media-corrections/model/location-undo'

describe('planLocationUndo', () => {
  it('clears items without coordinates and restores the others per position', () => {
    const steps = planLocationUndo(
      snapshotLocations([
        { id: 'a', latitude: null, longitude: null },
        { id: 'b', latitude: 50, longitude: 14 },
        { id: 'c', latitude: 50, longitude: 14 },
        { id: 'd', latitude: 48.2, longitude: 16.4 },
        { id: 'e', latitude: 50, longitude: null },
      ]),
    )
    expect(steps).toEqual([
      { ids: ['a', 'e'], kind: 'clear' },
      { ids: ['b', 'c'], kind: 'set', latitude: 50, longitude: 14 },
      { ids: ['d'], kind: 'set', latitude: 48.2, longitude: 16.4 },
    ])
  })

  it('has nothing to do for an empty selection', () => {
    expect(planLocationUndo([])).toEqual([])
  })
})
