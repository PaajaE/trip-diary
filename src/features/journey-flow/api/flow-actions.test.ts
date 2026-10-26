import { describe, expect, it, vi } from 'vitest'
import {
  createFlowActions,
  type FlowActionDeps,
} from '@/features/journey-flow/api/flow-actions'
import { buildDaySort } from '@/features/journey-flow/model/day-sort'
import { buildFlowDays } from '@/features/journey-flow/model/flow-days'
import {
  EMPTY_MARKERS,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'
import { fixtureDay, ID } from '@/features/journey-flow/test-fixtures'
import { mom } from '@/features/journey-workspace/test-fixtures'

function fakes() {
  let markers: FlowMarkers = EMPTY_MARKERS
  const deps: FlowActionDeps = {
    confirmMoments: vi.fn(() => Promise.resolve()),
    markMediaReviewed: vi.fn(() => Promise.resolve(1)),
    mergeMoments: vi.fn((target: string) => Promise.resolve(target)),
    moveMedia: vi.fn(() => Promise.resolve(2)),
    newId: () => 'new-id',
    shiftMediaTime: vi.fn(() => Promise.resolve(1)),
    splitMoment: vi.fn(() => Promise.resolve('new-id')),
    trashMedia: vi.fn(() => Promise.resolve(1)),
    updateMarkers: (_journey, change) => {
      markers = change(markers)
    },
    updateMoment: vi.fn(() => Promise.resolve(mom(1))),
  }
  return { actions: createFlowActions(deps), deps, markers: () => markers }
}

describe('flow actions', () => {
  it('confirms the stops of a day without marking any photo sorted', async () => {
    const { actions, deps } = fakes()
    await actions.confirmStops([ID.hotel, ID.lake])
    await actions.daySits({ daySitsIds: [ID.viewpoint] })
    expect(deps.confirmMoments).toHaveBeenNthCalledWith(1, [ID.hotel, ID.lake])
    expect(deps.confirmMoments).toHaveBeenNthCalledWith(2, [ID.viewpoint])
    expect(deps.markMediaReviewed).not.toHaveBeenCalled()
  })

  it('promotes a ride to a locked stay and renames with a trimmed title', async () => {
    const { actions, deps } = fakes()
    await actions.promoteEnRoute(ID.ride)
    expect(deps.updateMoment).toHaveBeenCalledWith(ID.ride, {
      kind: 'stay',
      locked: true,
    })
    await actions.renameStop(ID.lake, '  Peyto Lake ')
    expect(deps.updateMoment).toHaveBeenLastCalledWith(ID.lake, {
      title: 'Peyto Lake',
    })
    await expect(actions.renameStop(ID.lake, '   ')).rejects.toThrow()
  })

  it('merges into the previous stop and splits at a photo', async () => {
    const { actions, deps } = fakes()
    await actions.mergeWithPrevious(ID.hotel, ID.viewpoint)
    expect(deps.mergeMoments).toHaveBeenCalledWith(ID.hotel, ID.viewpoint)
    await actions.splitStop(ID.lake, '2026-06-05T12:20:00.000Z')
    expect(deps.splitMoment).toHaveBeenCalledWith(
      ID.lake,
      '2026-06-05T12:20:00.000Z',
      'new-id',
    )
  })

  it('handles copies: trash, fix the time, or keep both (client side)', async () => {
    const { actions, deps, markers } = fakes()
    await actions.trashCopy('copy')
    expect(deps.trashMedia).toHaveBeenCalledWith(['copy'])
    await actions.fixCopyTime('copy', -14_400)
    expect(deps.shiftMediaTime).toHaveBeenCalledWith(['copy'], -14_400)
    actions.keepBoth('j', '00000000-0000-4000-8000-000000000900')
    expect(markers().keptCopyIds).toEqual([
      '00000000-0000-4000-8000-000000000900',
    ])
    expect(await actions.assignToStop([], ID.lake)).toBe(0)
    expect(deps.moveMedia).not.toHaveBeenCalled()
  })

  it('confirms a stop only once all its photos are sorted', async () => {
    const { actions, deps } = fakes()
    const { placeNames, tree } = fixtureDay()
    const day = buildFlowDays({
      homeTz: 'UTC',
      markers: EMPTY_MARKERS,
      placeNames,
      tree,
    }).days[0]
    if (day === undefined) throw new Error('no day')
    const lake = buildDaySort(day).stops.find((s) => s.stop.id === ID.lake)
    if (lake === undefined) throw new Error('no lake')
    const ids = lake.photos.map((photo) => photo.item.id)
    await actions.sortPhotos(ids.slice(0, 2))
    expect(deps.markMediaReviewed).toHaveBeenCalledWith(ids.slice(0, 2), true)
    expect(await actions.finishStop(lake, new Set(ids.slice(0, 2)))).toBeNull()
    expect(deps.confirmMoments).not.toHaveBeenCalled()
    expect(await actions.finishStop(lake, new Set(ids))).toBe(ID.lake)
    expect(deps.confirmMoments).toHaveBeenCalledWith([ID.lake])
  })

  it('remembers opened stops and seen arrivals', () => {
    const { actions, markers } = fakes()
    actions.markOpened('j', ID.viewpoint)
    actions.acknowledgeArrivals('j', '2026-06-06T00:00:00+00:00')
    expect(markers().openedStopIds).toEqual([ID.viewpoint])
    expect(markers().seenUpTo).toBe('2026-06-06T00:00:00+00:00')
  })
})
