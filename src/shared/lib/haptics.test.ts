import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  impact: vi.fn(() => Promise.resolve()),
  isNative: vi.fn(() => true),
  notification: vi.fn(() => Promise.resolve()),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNative },
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: mocks.impact, notification: mocks.notification },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' },
}))

import { haptic } from '@/shared/lib/haptics'

describe('haptic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isNative.mockReturnValue(true)
  })

  it('maps kinds to impact and notification feedback on native', () => {
    haptic('light')
    haptic('medium')
    haptic('success')
    haptic('warning')
    expect(mocks.impact).toHaveBeenNthCalledWith(1, { style: 'LIGHT' })
    expect(mocks.impact).toHaveBeenNthCalledWith(2, { style: 'MEDIUM' })
    expect(mocks.notification).toHaveBeenNthCalledWith(1, { type: 'SUCCESS' })
    expect(mocks.notification).toHaveBeenNthCalledWith(2, { type: 'WARNING' })
  })

  it('does nothing on the web', () => {
    mocks.isNative.mockReturnValue(false)
    haptic('success')
    expect(mocks.impact).not.toHaveBeenCalled()
    expect(mocks.notification).not.toHaveBeenCalled()
  })

  it('never throws, synchronously or asynchronously', async () => {
    mocks.impact.mockImplementationOnce(() => Promise.reject(new Error('no')))
    expect(() => {
      haptic('light')
    }).not.toThrow()
    mocks.notification.mockImplementationOnce(() => {
      throw new Error('sync')
    })
    expect(() => {
      haptic('success')
    }).not.toThrow()
    await Promise.resolve()
  })
})
