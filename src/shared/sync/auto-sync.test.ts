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

  it('automatically syncs a native app when connected over Wi-Fi or cellular', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'cellular',
    })
    expect(await canAutomaticallySync()).toBe(true)

    mocks.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'wifi',
    })
    expect(await canAutomaticallySync()).toBe(true)
  })

  it('skips automatic sync on cellular when the user disabled it', async () => {
    localStorage.setItem('trip-diary:sync-on-cellular', '0')
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'cellular',
    })
    expect(await canAutomaticallySync()).toBe(false)
    localStorage.removeItem('trip-diary:sync-on-cellular')
  })
})
