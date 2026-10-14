import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  reconcileVideoUploads,
  reconcileVideoUploadsOnce,
  resetReconcileVideoUploadsForTests,
} from '@/features/media-upload/api/reconcile-video-uploads'
import type { PendingUpload } from '@/shared/lib/video-pipeline'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isPluginAvailable: () => false },
  registerPlugin: vi.fn(() => ({})),
}))

function pending(
  uploadKey: string,
  status: PendingUpload['status'],
): PendingUpload {
  return {
    bytesSent: 0,
    completedParts: 0,
    parts: [],
    status,
    totalParts: 2,
    uploadKey,
  }
}

beforeEach(() => {
  resetReconcileVideoUploadsForTests()
})

describe('reconcileVideoUploads', () => {
  it('does nothing when the native plugin is unavailable', async () => {
    const resume = vi.fn(() => Promise.resolve([]))
    await expect(
      reconcileVideoUploads({ isAvailable: () => false, resume }),
    ).resolves.toEqual({ cancelled: 0, completed: 0, running: 0 })
    expect(resume).not.toHaveBeenCalled()
  })

  it('cancels failed uploads and leaves running and completed ones', async () => {
    const cancel = vi.fn(() => Promise.resolve())
    const result = await reconcileVideoUploads({
      cancel,
      isAvailable: () => true,
      resume: () =>
        Promise.resolve([
          pending('a', 'failed'),
          pending('b', 'running'),
          pending('c', 'completed'),
        ]),
    })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith('a')
    expect(result).toEqual({ cancelled: 1, completed: 1, running: 1 })
  })

  it('swallows plugin errors', async () => {
    await expect(
      reconcileVideoUploads({
        isAvailable: () => true,
        resume: () => Promise.reject(new Error('boom')),
      }),
    ).resolves.toEqual({ cancelled: 0, completed: 0, running: 0 })
    const cancel = vi.fn(() => Promise.reject(new Error('x')))
    await expect(
      reconcileVideoUploads({
        cancel,
        isAvailable: () => true,
        resume: () => Promise.resolve([pending('a', 'failed')]),
      }),
    ).resolves.toMatchObject({ cancelled: 0 })
  })

  it('runs once per session', async () => {
    const overrides = {
      isAvailable: () => true,
      resume: () => Promise.resolve([]),
    }
    expect(reconcileVideoUploadsOnce(overrides)).not.toBeNull()
    expect(reconcileVideoUploadsOnce(overrides)).toBeNull()
  })
})
