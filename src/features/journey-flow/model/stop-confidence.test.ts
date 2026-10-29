import { describe, expect, it } from 'vitest'
import {
  confidenceRank,
  dayConfidence,
  type ConfidenceMedia,
  type ConfidenceStop,
} from '@/features/journey-flow/model/stop-confidence'

const at = (hm: string) => `2026-06-05T${hm}:00.000Z`
const A = { latitude: 52.7, longitude: -117.6 }
const B = { latitude: 52.9, longitude: -117.2 }

function media(
  times: string[],
  place: { latitude: number; longitude: number } | null = A,
  ownerId = 'me',
): ConfidenceMedia[] {
  return times.map((hm) => ({
    capturedAt: at(hm),
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    ownerId,
  }))
}

function stop(
  id: string,
  from: string,
  to: string,
  items: ConfidenceMedia[],
  over: Partial<ConfidenceStop> = {},
): ConfidenceStop {
  return {
    confirmed: false,
    endsAt: at(to),
    id,
    kind: 'stay',
    media: items,
    startsAt: at(from),
    ...over,
  }
}

describe('dayConfidence', () => {
  it('is sure about a plain stay', () => {
    const result = dayConfidence([
      stop('s', '10:00', '10:30', media(['10:00', '10:10', '10:30'])),
    ])
    expect(result.get('s')).toEqual({ level: 'high', reasons: [] })
  })

  it('questions a single point and a stop next to a ride', () => {
    const result = dayConfidence([
      stop('ride', '09:00', '09:40', media(['09:00', '09:40'], B), {
        kind: 'en_route',
      }),
      stop('one', '09:50', '09:50', media(['09:50'])),
      stop('two', '11:00', '11:30', media(['11:00', '11:30'])),
      stop('ride2', '11:40', '12:00', media(['11:40'], B), {
        kind: 'en_route',
      }),
    ])
    expect(result.get('one')).toEqual({
      level: 'low',
      reasons: ['singlePoint', 'nearRide'],
    })
    expect(result.get('two')).toEqual({
      level: 'medium',
      reasons: ['nearRide'],
    })
    // A bigger stop with a ride on one side only (hotel before a drive).
    const hotel = dayConfidence([
      stop('h', '07:00', '07:50', media(['07:00', '07:20', '07:50'])),
      stop('r', '08:00', '09:00', media(['08:00'], B), { kind: 'en_route' }),
    ])
    expect(hotel.get('h')).toEqual({ level: 'high', reasons: [] })
    expect(result.get('ride')?.level).toBe('high')
  })

  it('finds parallel authors, long gaps and spread photos', () => {
    const result = dayConfidence([
      stop('mine', '10:00', '13:00', media(['10:00', '13:00'], A, 'me')),
      stop('theirs', '10:30', '11:00', media(['10:30', '11:00'], B, 'you')),
      stop('wide', '14:00', '14:30', [
        ...media(['14:00'], A),
        ...media(['14:30'], { latitude: 52.72, longitude: -117.6 }),
      ]),
    ])
    expect(result.get('mine')?.reasons).toEqual(['parallel', 'longGap'])
    expect(result.get('theirs')?.reasons).toEqual(['parallel'])
    expect(result.get('wide')).toEqual({ level: 'medium', reasons: ['spread'] })
  })

  it('does not question a confirmed stop', () => {
    const result = dayConfidence([
      stop('c', '10:00', '10:00', media(['10:00']), { confirmed: true }),
    ])
    expect(result.get('c')).toEqual({ level: 'confirmed', reasons: [] })
    expect(confidenceRank('low')).toBeLessThan(confidenceRank('confirmed'))
  })

  it('treats a lone photo as a valid point unless something else is odd', () => {
    const result = dayConfidence([
      stop('a', '09:00', '09:30', media(['09:00', '09:30'])),
      stop('lone', '12:00', '12:00', media(['12:00'], B)),
    ])
    expect(result.get('lone')).toEqual({ level: 'high', reasons: [] })
  })

  it('does not call stops parallel when GPS is missing', () => {
    const result = dayConfidence([
      stop('mine', '10:00', '10:40', media(['10:00', '10:40'], null, 'me')),
      stop('theirs', '10:10', '10:30', media(['10:10', '10:30'], B, 'you')),
    ])
    expect(result.get('mine')?.reasons).not.toContain('parallel')
    expect(result.get('theirs')?.reasons).not.toContain('parallel')
  })
})
