import { describe, expect, it, vi } from 'vitest'
import { resolveCaptureTime } from '@/features/media-upload/lib/capture-time'

vi.mock('exifr', () => ({ default: { parse: vi.fn() } }))

const noGps = { latitude: null, longitude: null }

describe('resolveCaptureTime', () => {
  it('is null without EXIF time', () => {
    expect(
      resolveCaptureTime(
        {
          dateTimeOriginal: null,
          offsetTimeOriginal: null,
          subsecTimeOriginal: null,
        },
        noGps,
      ),
    ).toEqual({ capturedAt: null, capturedTz: null })
  })

  it('uses the GPS zone for the zone name when an offset exists', () => {
    expect(
      resolveCaptureTime(
        {
          dateTimeOriginal: '2026:09:11 12:00:00',
          offsetTimeOriginal: '+02:00',
          subsecTimeOriginal: null,
        },
        { latitude: 50.08, longitude: 14.42 },
      ),
    ).toEqual({
      capturedAt: '2026-09-11T10:00:00.000Z',
      capturedTz: 'Europe/Prague',
    })
  })

  it('falls back to an Etc zone from the EXIF offset without GPS', () => {
    expect(
      resolveCaptureTime(
        {
          dateTimeOriginal: '2026:09:11 12:00:00',
          offsetTimeOriginal: '-06:00',
          subsecTimeOriginal: null,
        },
        noGps,
      ),
    ).toEqual({
      capturedAt: '2026-09-11T18:00:00.000Z',
      capturedTz: 'Etc/GMT+6',
    })
  })

  it('interprets an offset-less wall clock in the GPS zone', () => {
    expect(
      resolveCaptureTime(
        {
          dateTimeOriginal: '2026:09:11 12:00:00',
          offsetTimeOriginal: null,
          subsecTimeOriginal: null,
        },
        { latitude: 50.08, longitude: 14.42 },
      ),
    ).toEqual({
      capturedAt: '2026-09-11T10:00:00.000Z',
      capturedTz: 'Europe/Prague',
    })
  })

  it('does not guess when there is no offset and no GPS', () => {
    expect(
      resolveCaptureTime(
        {
          dateTimeOriginal: '2026:09:11 12:00:00',
          offsetTimeOriginal: null,
          subsecTimeOriginal: null,
        },
        noGps,
      ),
    ).toEqual({ capturedAt: null, capturedTz: null })
  })
})
