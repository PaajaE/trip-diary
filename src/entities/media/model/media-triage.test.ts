import { describe, expect, it } from 'vitest'
import {
  isPromotableTriageState,
  isUploadedMediaStatus,
  mediaTriageState,
  type MediaTriageRow,
} from '@/entities/media/model/media-triage'

const T = '2026-11-10T10:00:00.000Z'
const row = (patch: Partial<MediaTriageRow>): MediaTriageRow => ({
  deletedAt: null,
  reviewedAt: null,
  starred: false,
  status: 'found',
  ...patch,
})

describe('mediaTriageState (mirrors known_source_assets + triage_found_media)', () => {
  it('found, not reviewed, not deleted -> found', () => {
    expect(mediaTriageState(row({}))).toBe('found')
  })

  it('an unreviewed starred row stays found (plain starred update)', () => {
    expect(mediaTriageState(row({ starred: true }))).toBe('found')
  })

  it('reviewed -> kept; reviewed + starred -> starred', () => {
    expect(mediaTriageState(row({ reviewedAt: T }))).toBe('kept')
    expect(mediaTriageState(row({ reviewedAt: T, starred: true }))).toBe(
      'starred',
    )
  })

  it('deleted wins over reviewed and starred -> dismissed', () => {
    expect(mediaTriageState(row({ deletedAt: T }))).toBe('dismissed')
    expect(
      mediaTriageState(row({ deletedAt: T, reviewedAt: T, starred: true })),
    ).toBe('dismissed')
  })

  it('every non-found status is uploaded, whatever the markers', () => {
    for (const status of ['pending', 'uploading', 'ready', 'failed'] as const) {
      expect(
        mediaTriageState(
          row({ deletedAt: T, reviewedAt: T, starred: true, status }),
        ),
      ).toBe('uploaded')
    }
  })

  it('only kept and starred can be promoted', () => {
    expect(isPromotableTriageState('kept')).toBe(true)
    expect(isPromotableTriageState('starred')).toBe(true)
    for (const state of ['found', 'dismissed', 'uploaded'] as const) {
      expect(isPromotableTriageState(state)).toBe(false)
    }
  })

  it('found is not an uploaded status', () => {
    expect(isUploadedMediaStatus('found')).toBe(false)
    expect(isUploadedMediaStatus('ready')).toBe(true)
  })
})
