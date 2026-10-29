import { describe, expect, it } from 'vitest'
import {
  batchSettled,
  freshUploads,
  uploadedMediaIds,
} from '@/features/journey-organize/model/upload-trigger'

const jobs = [
  { mediaId: 'm1', state: 'done' },
  { state: 'done' },
  { mediaId: 'm3', state: 'failed' },
  { mediaId: 'm4', state: 'done' },
]

describe('upload trigger', () => {
  it('lists the media of finished jobs', () => {
    expect(uploadedMediaIds(jobs)).toEqual(['m1', 'm4'])
  })

  it('settles only when nothing waits or runs', () => {
    expect(batchSettled({ jobs, runtime: 'idle' })).toBe(true)
    expect(batchSettled({ jobs, runtime: 'running' })).toBe(false)
    expect(batchSettled({ jobs, runtime: 'waiting_online' })).toBe(false)
    expect(
      batchSettled({ jobs: [...jobs, { state: 'pending' }], runtime: 'idle' }),
    ).toBe(false)
    expect(
      batchSettled({ jobs: [{ state: 'paused' }], runtime: 'paused' }),
    ).toBe(true)
  })

  it('keeps only uploads that were not known', () => {
    expect(freshUploads({ jobs, runtime: 'idle' }, new Set(['m1']))).toEqual([
      'm4',
    ])
  })
})
