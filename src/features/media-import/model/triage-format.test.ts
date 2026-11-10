import { describe, expect, it } from 'vitest'
import {
  formatDayHeading,
  formatDayRange,
  formatTime,
  projectRoute,
} from '@/features/media-import/model/triage-format'

describe('triage formatting', () => {
  it('formats day ranges and headings in Czech', () => {
    expect(formatDayRange('2026-08-03', '2026-08-11', 'cs')).toBe(
      '3.–11. 8. 2026',
    )
    expect(formatDayRange('2026-08-03', '2026-08-03', 'cs')).toBe('3. 8. 2026')
    expect(formatDayHeading('2026-08-04', 'cs')).toMatch(/4\. 8\./)
  })
  it('formats the time in the given zone', () => {
    expect(
      formatTime('2026-08-04T20:07:00.000Z', 'cs', 'America/Edmonton'),
    ).toBe('14:07')
  })
  it('projects a route into the box; one point is centred', () => {
    const pts = projectRoute(
      [
        { latitude: 50, longitude: -115 },
        { latitude: 52, longitude: -113 },
      ],
      100,
      50,
      10,
    )
    expect(pts[0]).toEqual({ x: 10, y: 40 })
    expect(pts[1]).toEqual({ x: 90, y: 10 })
    expect(projectRoute([{ latitude: 1, longitude: 1 }], 100, 50, 10)).toEqual([
      { x: 50, y: 25 },
    ])
    expect(projectRoute([], 100, 50, 10)).toEqual([])
  })
})
