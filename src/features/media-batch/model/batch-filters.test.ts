import { describe, expect, it } from 'vitest'
import { med } from '@/features/journey-workspace/test-fixtures'
import { groupBatchByDay } from './batch-days'
import {
  buildFilterModel,
  filterDays,
  filterCount,
  matchesFilter,
  uploaderFilter,
  visibleFilters,
} from './batch-filters'

/** Camera-sized, so the "likely junk" rule (tiny, no GPS) stays out of these tests. */
const FULL_SIZE = { height: 3000, width: 4000 }

const geo = { latitude: 50, longitude: 14 }
// Two near-identical shots seconds apart form a series; the third is far away.
const s1 = med(1, {
  ...FULL_SIZE,
  ...geo,
  capturedAt: '2026-01-02T09:00:00+00:00',
  phash: 5,
})
const s2 = med(2, {
  ...FULL_SIZE,
  ...geo,
  capturedAt: '2026-01-02T09:00:10+00:00',
  phash: 5,
})
const lone = med(3, {
  ...FULL_SIZE,
  capturedAt: '2026-01-03T09:00:00+00:00',
  latitude: null,
  longitude: null,
})
const clip = med(4, {
  ...FULL_SIZE,
  ...geo,
  capturedAt: '2026-01-03T10:00:00+00:00',
  kind: 'video',
})

describe('batch filters', () => {
  it('counts every chip', () => {
    const model = buildFilterModel([s1, s2, lone, clip])
    expect(model.counts).toEqual({
      all: 4,
      junk: 0,
      noLocation: 1,
      series: 2,
      video: 1,
    })
    expect(model.seriesIds.has(s1.id)).toBe(true)
    expect(model.seriesIds.has(lone.id)).toBe(false)
  })

  it('hides empty chips except "all"', () => {
    expect(visibleFilters(buildFilterModel([s1, s2, lone, clip]))).toEqual([
      'all',
      'noLocation',
      'series',
      'video',
    ])
    expect(visibleFilters(buildFilterModel([s1]))).toEqual(['all'])
    expect(visibleFilters(buildFilterModel([]))).toEqual(['all'])
  })

  it('matches by predicate', () => {
    const model = buildFilterModel([s1, s2, lone, clip])
    expect(matchesFilter(lone, 'noLocation', model)).toBe(true)
    expect(matchesFilter(s1, 'noLocation', model)).toBe(false)
    expect(matchesFilter(s2, 'series', model)).toBe(true)
    expect(matchesFilter(clip, 'video', model)).toBe(true)
    expect(matchesFilter(clip, 'all', model)).toBe(true)
  })

  it('filters days and drops the empty ones', () => {
    const items = [s1, s2, lone, clip]
    const model = buildFilterModel(items)
    const days = groupBatchByDay(items)
    expect(filterDays(days, 'all', model)).toHaveLength(2)
    const series = filterDays(days, 'series', model)
    expect(series).toHaveLength(1)
    expect(series[0]?.items.map((i) => i.id)).toEqual([s1.id, s2.id])
    expect(filterDays(days, 'video', model)[0]?.items).toEqual([clip])
  })
})

describe('uploader filters', () => {
  const ME = '00000000-0000-4000-8000-000000000997'
  const OTHER = '00000000-0000-4000-8000-000000000998'
  const mine = med(31, { ...FULL_SIZE, ownerId: ME })
  const theirs = med(32, { ...FULL_SIZE, ownerId: OTHER })
  const shared = {
    currentUserId: ME,
    multi: true,
    names: new Map([[OTHER, 'Jirina']]),
  }

  it('adds one chip per other uploader in a shared journey', () => {
    const model = buildFilterModel([mine, theirs], shared)
    expect(model.uploaders).toEqual([
      { count: 1, name: 'Jirina', userId: OTHER },
    ])
    expect(visibleFilters(model)).toEqual([
      'all',
      'noLocation',
      uploaderFilter(OTHER),
    ])
    expect(filterCount(model, uploaderFilter(OTHER))).toBe(1)
    expect(matchesFilter(theirs, uploaderFilter(OTHER), model)).toBe(true)
    expect(matchesFilter(mine, uploaderFilter(OTHER), model)).toBe(false)
  })

  it('adds nothing for single-member journeys', () => {
    const solo = {
      currentUserId: ME,
      multi: false,
      names: new Map<string, string>(),
    }
    expect(buildFilterModel([mine, theirs], solo).uploaders).toEqual([])
    expect(buildFilterModel([mine, theirs]).uploaders).toEqual([])
  })

  it('filters days to the uploader', () => {
    const items = [mine, theirs]
    const model = buildFilterModel(items, shared)
    const days = filterDays(
      groupBatchByDay(items),
      uploaderFilter(OTHER),
      model,
    )
    expect(days[0]?.items).toEqual([theirs])
  })
})
