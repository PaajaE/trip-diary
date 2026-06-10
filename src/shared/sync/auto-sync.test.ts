import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  isNativePlatform: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}))
vi.mock('@capacitor/network', () => ({
  Network: { getStatus: mocks.getStatus },
}))

import { canAutomaticallySync } from '@/shared/sync/auto-sync'

describe('canAutomaticallySync', () => {
  beforeEach(() => {
    mocks.getStatus.mockReset()
    mocks.isNativePlatform.mockReset()
  })

  it('uses browser online state on the web', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    expect(await canAutomaticallySync()).toBe(true)
  })

  it('only automatically syncs a native app over Wi-Fi', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'cellular',
    })
    expect(await canAutomaticallySync()).toBe(false)

    mocks.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'wifi',
    })
    expect(await canAutomaticallySync()).toBe(true)
  })
})
