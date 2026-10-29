import { afterEach, describe, expect, it } from 'vitest'
import {
  getFlowMarkers,
  resetFlowMarkersCache,
  updateFlowMarkers,
  FLOW_MARKERS_PREFIX,
} from '@/features/journey-flow/api/flow-markers.store'
import {
  clearFlowState,
  FLOW_OWNER_KEY,
} from '@/features/journey-flow/api/flow-owner'
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
  MAX_SEEN_DAYS,
  parseFlowMarkers,
  seenUpToOf,
} from '@/features/journey-flow/model/flow-markers'
import { med, mom, uuid } from '@/features/journey-workspace/test-fixtures'

const J = uuid(999)
const U = uuid(500)
const OTHER = uuid(501)

afterEach(() => {
  window.localStorage.clear()
  resetFlowMarkersCache()
})

const DAY = '2026-01-01'
const OTHER_DAY = '2026-01-02'

describe('flow markers', () => {
  it('marks stops of remembered runs as new until their day is seen', () => {
    const stop = mom(1)
    const other = mom(2)
    let markers = addRun(EMPTY_MARKERS, 'r1', [stop.id, other.id])
    expect(isNewStop(stop, markers, DAY)).toBe(true)
    // A stop the user confirmed is not new.
    expect(isNewStop({ ...stop, locked: true }, markers, DAY)).toBe(false)
    expect(isNewStop({ ...stop, origin: 'manual' }, markers, DAY)).toBe(false)
    markers = acknowledgeArrivals(markers, DAY, '2026-01-01T00:00:00+00:00', [
      stop.id,
    ])
    expect(isNewStop(stop, markers, DAY)).toBe(false)
    // The stop of another day keeps its "nová".
    expect(isNewStop(other, markers, OTHER_DAY)).toBe(true)
    expect(markers.runs).toEqual([{ momentIds: [other.id], runId: 'r1' }])
  })

  it('treats stops newer than their day marker as new (another device ran)', () => {
    const markers = acknowledgeArrivals(
      EMPTY_MARKERS,
      DAY,
      '2026-01-01T00:00:00+00:00',
    )
    const fresh = mom(1, { createdAt: '2026-01-02T00:00:00+00:00' })
    expect(isNewStop(fresh, markers, DAY)).toBe(true)
    // A day never seen: only remembered runs count (no "nová" everywhere).
    expect(isNewStop(fresh, markers, OTHER_DAY)).toBe(false)
    expect(isNewStop(mom(1), EMPTY_MARKERS, DAY)).toBe(false)
  })

  it('acknowledges one day without touching the others', () => {
    let markers = acknowledgeArrivals(
      EMPTY_MARKERS,
      OTHER_DAY,
      '2026-01-03T00:00:00+00:00',
    )
    markers = acknowledgeArrivals(markers, DAY, '2026-01-05T00:00:00+00:00')
    expect(seenUpToOf(markers, DAY)).toBe('2026-01-05T00:00:00+00:00')
    expect(seenUpToOf(markers, OTHER_DAY)).toBe('2026-01-03T00:00:00+00:00')
    expect(seenUpToOf(markers, '2026-01-09')).toBeNull()
    // A marker never moves back.
    const again = acknowledgeArrivals(markers, DAY, '2026-01-04T00:00:00+00:00')
    expect(seenUpToOf(again, DAY)).toBe('2026-01-05T00:00:00+00:00')
    // Nothing arrived (null): only the stops leave the runs.
    expect(acknowledgeArrivals(markers, DAY, null)).toBe(markers)
  })

  it('caps the remembered days, oldest first', () => {
    let markers = EMPTY_MARKERS
    for (let i = 0; i < MAX_SEEN_DAYS + 3; i += 1) {
      markers = acknowledgeArrivals(
        markers,
        `d${String(i)}`,
        '2026-01-01T00:00:00+00:00',
      )
    }
    expect(Object.keys(markers.seenDays)).toHaveLength(MAX_SEEN_DAYS)
    expect(seenUpToOf(markers, 'd0')).toBeNull()
    expect(seenUpToOf(markers, `d${String(MAX_SEEN_DAYS + 2)}`)).not.toBeNull()
  })

  it('migrates version 1 and ignores its journey-wide watermark', () => {
    const migrated = parseFlowMarkers({
      keptCopyIds: [uuid(7)],
      openedStopIds: [uuid(6)],
      runs: [{ momentIds: [uuid(5)], runId: 'r1' }],
      seenUpTo: '2026-01-01T00:00:00+00:00',
      version: 1,
    })
    expect(migrated).toEqual({
      keptCopyIds: [uuid(7)],
      openedStopIds: [uuid(6)],
      runs: [{ momentIds: [uuid(5)], runId: 'r1' }],
      seenDays: {},
      version: 2,
    })
    expect(
      parseFlowMarkers({ ...EMPTY_MARKERS, seenDays: { [DAY]: 'yesterday' } }),
    ).toEqual(EMPTY_MARKERS)
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
    window.localStorage.setItem(`${FLOW_MARKERS_PREFIX}${U}:${J}`, '{not json')
    expect(getFlowMarkers(U, J)).toEqual(EMPTY_MARKERS)
  })

  it('persists transitions in localStorage', () => {
    updateFlowMarkers(U, J, (markers) => addRun(markers, 'r1', [uuid(5)]))
    resetFlowMarkersCache()
    expect(getFlowMarkers(U, J).runs).toEqual([
      { momentIds: [uuid(5)], runId: 'r1' },
    ])
  })

  it('keeps markers per user and wipes them when another user signs in', () => {
    updateFlowMarkers(U, J, (markers) => addRun(markers, 'r1', [uuid(5)]))
    expect(getFlowMarkers(OTHER, J)).toEqual(EMPTY_MARKERS)
    updateFlowMarkers(OTHER, J, (markers) => markStopOpened(markers, uuid(6)))
    resetFlowMarkersCache()
    // The first user's markers are gone from the device.
    expect(getFlowMarkers(U, J)).toEqual(EMPTY_MARKERS)
    expect(getFlowMarkers(OTHER, J).openedStopIds).toEqual([uuid(6)])
  })

  it('wipes every marker on sign-out', async () => {
    updateFlowMarkers(U, J, (markers) => addRun(markers, 'r1', [uuid(5)]))
    await clearFlowState()
    expect(getFlowMarkers(U, J)).toEqual(EMPTY_MARKERS)
    expect(window.localStorage.getItem(FLOW_OWNER_KEY)).toBeNull()
  })
})
