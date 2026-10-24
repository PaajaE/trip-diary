import { describe, expect, it } from 'vitest'
import {
  chapterProgress,
  dayMediaCounts,
  isUnreviewed,
  dayStatus,
} from '@/features/journey-workspace/model/day-status'

const base = { dated: true, hasNote: false, total: 4, unreviewed: 0 }

describe('dayStatus', () => {
  it('is done with all media reviewed and a note', () => {
    expect(dayStatus({ ...base, hasNote: true })).toEqual({
      note: 'has',
      overall: 'done',
      photos: 'done',
      unreviewed: 0,
    })
  })

  it('is in progress when photos are done but the note is missing', () => {
    const s = dayStatus(base)
    expect(s).toMatchObject({ note: 'missing', overall: 'inProgress' })
    expect(s.photos).toBe('done')
  })

  it('is not started when every media is unreviewed and no note', () => {
    expect(dayStatus({ ...base, unreviewed: 4 })).toMatchObject({
      overall: 'notStarted',
      photos: 'pending',
      unreviewed: 4,
    })
  })

  it('is in progress when some media is unreviewed (boundaries)', () => {
    expect(dayStatus({ ...base, unreviewed: 1 })).toMatchObject({
      overall: 'inProgress',
      photos: 'pending',
    })
    expect(dayStatus({ ...base, hasNote: true, unreviewed: 4 }).overall).toBe(
      'inProgress',
    )
  })

  it('treats an empty day as done only with a note', () => {
    const empty = { ...base, total: 0 }
    expect(dayStatus(empty)).toMatchObject({
      overall: 'inProgress',
      photos: 'none',
    })
    expect(dayStatus({ ...empty, hasNote: true })).toMatchObject({
      overall: 'done',
      photos: 'none',
    })
  })

  it('has no note state for an undated day and never finishes', () => {
    const s = dayStatus({ ...base, dated: false })
    expect(s.note).toBe('na')
    expect(s.overall).toBe('inProgress')
    expect(dayStatus({ ...base, dated: false, hasNote: true }).overall).toBe(
      'inProgress',
    )
  })

  it('clamps an unreviewed count above the total', () => {
    expect(dayStatus({ ...base, unreviewed: 9 }).unreviewed).toBe(4)
  })
})

describe('chapterProgress', () => {
  it('counts done days', () => {
    const done = dayStatus({ ...base, hasNote: true })
    const open = dayStatus(base)
    expect(chapterProgress([{ status: done }, { status: open }])).toEqual({
      done: 1,
      total: 2,
    })
    expect(chapterProgress([])).toEqual({ done: 0, total: 0 })
  })
})

describe('isUnreviewed', () => {
  it('only null is unreviewed; undefined counts as reviewed', () => {
    expect(isUnreviewed({ reviewedAt: null })).toBe(true)
    expect(isUnreviewed({})).toBe(false)
    expect(isUnreviewed({ reviewedAt: '2026-06-01T10:00:00Z' })).toBe(false)
  })
})

describe('dayMediaCounts', () => {
  it('sums media over moments', () => {
    const moment = (reviewed: (string | null | undefined)[]) =>
      ({
        media: reviewed.map((reviewedAt) => ({ reviewedAt })),
      }) as never
    expect(
      dayMediaCounts([
        moment([null, undefined]),
        moment(['2026-06-01T10:00:00Z', null]),
      ]),
    ).toEqual({ total: 4, unreviewed: 2 })
  })
})
