import { afterEach, describe, expect, it } from 'vitest'
import {
  getFlowMarkers,
  resetFlowMarkersCache,
  updateFlowMarkers,
  FLOW_MARKERS_PREFIX,
} from '@/features/journey-flow/api/flow-markers.store'
import {
  acknowledgeArrivals,
  addRun,
  arrivedAfter,
  EMPTY_MARKERS,
  forgetRun,
  isNewStop,
  latestArrival,
  markStopOpened,
  MAX_REMEMBERED_RUNS,
  parseFlowMarkers,
} from '@/features/journey-flow/model/flow-markers'
import { med, mom, uuid } from '@/features/journey-workspace/test-fixtures'

const J = uuid(999)

afterEach(() => {
  window.localStorage.clear()
  resetFlowMarkersCache()
})

describe('flow markers', () => {
  it('marks stops of remembered runs as new until seen', () => {
    const stop = mom(1)
    let markers = addRun(EMPTY_MARKERS, 'r1', [stop.id])
    expect(isNewStop(stop, markers)).toBe(true)
    // A stop the user confirmed is not new.
    expect(isNewStop({ ...stop, locked: true }, markers)).toBe(false)
    expect(isNewStop({ ...stop, origin: 'manual' }, markers)).toBe(false)
    markers = acknowledgeArrivals(markers, '2026-01-01T00:00:00+00:00')
    expect(isNewStop(stop, markers)).toBe(false)
  })

  it('treats stops newer than the seen marker as new (another device ran)', () => {
    const markers = acknowledgeArrivals(
      EMPTY_MARKERS,
      '2026-01-01T00:00:00+00:00',
    )
    expect(
      isNewStop(mom(1, { createdAt: '2026-01-02T00:00:00+00:00' }), markers),
    ).toBe(true)
    // Never seen: only remembered runs count (no "nová" over a whole journey).
    expect(isNewStop(mom(1), EMPTY_MARKERS)).toBe(false)
  })

  it('forgets an undone run and caps the remembered runs', () => {
    let markers = EMPTY_MARKERS
    for (let i = 0; i < MAX_REMEMBERED_RUNS + 5; i += 1) {
      markers = addRun(markers, `r${String(i)}`, [uuid(i + 1)])
    }
    expect(markers.runs).toHaveLength(MAX_REMEMBERED_RUNS)
    markers = forgetRun(markers, 'r24')
    expect(markers.runs.some((run) => run.runId === 'r24')).toBe(false)
    expect(addRun(markers, 'empty', [])).toBe(markers)
  })

  it('records opened stops once', () => {
    const once = markStopOpened(EMPTY_MARKERS, uuid(1))
    expect(markStopOpened(once, uuid(1))).toBe(once)
    expect(once.openedStopIds).toEqual([uuid(1)])
  })

  it('finds the latest arrival over media and stops', () => {
    expect(
      latestArrival(
        [med(1, { createdAt: '2026-01-02T00:00:00+00:00' })],
        [mom(2, { createdAt: '2026-01-03T00:00:00+00:00' })],
      ),
    ).toBe('2026-01-03T00:00:00+00:00')
    expect(latestArrival([], [])).toBeNull()
    expect(arrivedAfter('2026-01-02T00:00:00Z', null)).toBe(true)
    expect(
      arrivedAfter('2026-01-02T00:00:00Z', '2026-01-02T00:00:00+00:00'),
    ).toBe(false)
  })

  it('reads invalid stored data as empty', () => {
    expect(parseFlowMarkers({ version: 9 })).toEqual(EMPTY_MARKERS)
    window.localStorage.setItem(`${FLOW_MARKERS_PREFIX}${J}`, '{not json')
    expect(getFlowMarkers(J)).toEqual(EMPTY_MARKERS)
  })

  it('persists transitions in localStorage', () => {
    updateFlowMarkers(J, (markers) => addRun(markers, 'r1', [uuid(5)]))
    resetFlowMarkersCache()
    expect(getFlowMarkers(J).runs).toEqual([
      { momentIds: [uuid(5)], runId: 'r1' },
    ])
  })
})
