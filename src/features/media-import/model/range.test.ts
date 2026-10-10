import { describe, expect, it } from 'vitest'
import {
  applyRange,
  dayRange,
  resolveRange,
  sinceRange,
  summarizeCandidates,
} from '@/features/media-import/model/range'
import type { ImportCandidate } from '@/features/media-import/model/types'

function at(capturedAt: string | null, over: Partial<ImportCandidate> = {}) {
  return {
    capturedAt,
    durationMs: null,
    latitude: null,
    longitude: null,
    mediaType: 'photo',
    sourceId: `${String(capturedAt)}-${String(Math.random())}`,
    ...over,
  } satisfies ImportCandidate
}

describe('dayRange', () => {
  it('uses the zone calendar: Europe/Prague summer (+02:00)', () => {
    expect(dayRange('2026-09-11', '2026-09-12', 'Europe/Prague')).toEqual({
      from: '2026-09-10T22:00:00.000Z',
      to: '2026-09-12T22:00:00.000Z',
    })
  })

  it('handles UTC and the 23-hour spring-forward day in Prague', () => {
    expect(dayRange('2026-09-11', '2026-09-11', 'UTC')).toEqual({
      from: '2026-09-11T00:00:00.000Z',
      to: '2026-09-12T00:00:00.000Z',
    })
    // 2026-03-29: Prague switches +01:00 -> +02:00 at 02:00.
    expect(dayRange('2026-03-29', '2026-03-29', 'Europe/Prague')).toEqual({
      from: '2026-03-28T23:00:00.000Z',
      to: '2026-03-29T22:00:00.000Z',
    })
  })

  it('leaves open ends open and ignores malformed days', () => {
    expect(dayRange('2026-09-11', null, 'UTC')).toEqual({
      from: '2026-09-11T00:00:00.000Z',
    })
    expect(dayRange('', '', 'UTC')).toEqual({})
    expect(dayRange(null, 'nope', 'UTC')).toEqual({})
  })

  it('rolls the end day over a month boundary', () => {
    expect(dayRange(null, '2026-09-30', 'UTC').to).toBe(
      '2026-10-01T00:00:00.000Z',
    )
  })
})

describe('applyRange', () => {
  const inside = at('2026-09-11T10:00:00.000Z')
  const before = at('2026-09-10T21:59:59.999Z')
  const atEnd = at('2026-09-12T22:00:00.000Z')
  const noTime = at(null)

  it('keeps everything without a range', () => {
    expect(applyRange([inside, before, noTime], undefined)).toHaveLength(3)
    expect(applyRange([inside, noTime], {})).toHaveLength(2)
  })

  it('is from-inclusive and to-exclusive and flags undated items', () => {
    const range = dayRange('2026-09-11', '2026-09-12', 'Europe/Prague')
    const result = applyRange([before, inside, atEnd, noTime], range)
    expect(result).toEqual([
      inside,
      { ...noTime, skipReason: 'no_capture_time' },
    ])
  })

  it('keeps an existing skip reason on undated items', () => {
    const heic = at(null, { skipReason: 'heic_unsupported' })
    expect(applyRange([heic], { from: '2026-01-01T00:00:00.000Z' })).toEqual([
      heic,
    ])
  })

  it('"since last import" starts strictly after the cursor', () => {
    const cursor = '2026-09-11T10:00:00.000Z'
    const range = sinceRange(cursor)
    const same = at(cursor)
    const later = at('2026-09-11T10:00:00.001Z')
    expect(applyRange([same, later], range)).toEqual([later])
  })
})

describe('resolveRange / summarizeCandidates', () => {
  it('maps UI choices to ranges', () => {
    expect(resolveRange({ mode: 'all' })).toBeUndefined()
    expect(
      resolveRange({
        fromDay: '2026-09-11',
        mode: 'dates',
        timeZone: 'UTC',
        toDay: '2026-09-11',
      }),
    ).toEqual({
      from: '2026-09-11T00:00:00.000Z',
      to: '2026-09-12T00:00:00.000Z',
    })
    expect(
      resolveRange({
        lastCapturedAt: '2026-09-11T10:00:00.000Z',
        mode: 'since',
      }),
    ).toEqual({ from: '2026-09-11T10:00:00.001Z' })
  })

  it('counts photos, videos and skipped by reason', () => {
    const summary = summarizeCandidates([
      at('2026-09-11T10:00:00.000Z'),
      at('2026-09-11T10:00:00.000Z'),
      at('2026-09-11T10:00:00.000Z', { mediaType: 'video' }),
      at('2026-09-11T10:00:00.000Z', {
        mediaType: 'video',
        skipReason: 'video_too_long',
      }),
      at(null, { skipReason: 'heic_unsupported' }),
    ])
    expect(summary).toEqual({
      photos: 2,
      skipped: { heic_unsupported: 1, video_too_long: 1 },
      skippedTotal: 2,
      videos: 1,
    })
  })
})
