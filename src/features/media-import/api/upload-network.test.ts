import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ on: true }))
const network = vi.hoisted(() => ({
  getStatus: vi.fn(),
  listener: null as
    | null
    | ((s: { connected: boolean; connectionType: string }) => void),
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.on },
}))
vi.mock('@capacitor/network', () => ({
  Network: {
    addListener: (_e: string, cb: typeof network.listener) => {
      network.listener = cb
      return Promise.resolve({ remove: () => Promise.resolve() })
    },
    getStatus: network.getStatus,
  },
}))

import {
  isUploadNetworkAllowed,
  onUploadNetworkChange,
  resetUploadNetworkForTests,
  uploadWaitReason,
} from '@/features/media-import/api/upload-network'
import { setCellularSyncEnabled } from '@/shared/sync/sync-preferences'

describe('upload network gate', () => {
  beforeEach(() => {
    localStorage.clear()
    native.on = true
    resetUploadNetworkForTests()
    network.getStatus.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is always allowed on the web (online)', () => {
    native.on = false
    expect(isUploadNetworkAllowed()).toBe(true)
  })

  it('blocks until the connection type is known, then notifies', async () => {
    network.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'wifi',
    })
    const changed = vi.fn()
    onUploadNetworkChange(changed)
    expect(isUploadNetworkAllowed()).toBe(false)
    await vi.waitFor(() => {
      expect(changed).toHaveBeenCalled()
    })
    expect(isUploadNetworkAllowed()).toBe(true)
  })

  it('waits on mobile data unless the author allowed it, and reacts to the toggle', async () => {
    network.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'cellular',
    })
    const changed = vi.fn()
    onUploadNetworkChange(changed)
    await vi.waitFor(() => {
      expect(changed).toHaveBeenCalled()
    })
    expect(isUploadNetworkAllowed()).toBe(false)
    expect(uploadWaitReason()).toBe('wifi')
    changed.mockClear()
    setCellularSyncEnabled(true)
    expect(changed).toHaveBeenCalled()
    expect(isUploadNetworkAllowed()).toBe(true)
    expect(uploadWaitReason()).toBeNull()
  })

  it('follows network changes', async () => {
    network.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'cellular',
    })
    const changed = vi.fn()
    onUploadNetworkChange(changed)
    await vi.waitFor(() => {
      expect(changed).toHaveBeenCalled()
    })
    network.listener?.({ connected: true, connectionType: 'wifi' })
    expect(isUploadNetworkAllowed()).toBe(true)
  })

  it('stays blocked when the plugin fails (mobile data not allowed)', async () => {
    network.getStatus.mockRejectedValue(new Error('no plugin'))
    expect(isUploadNetworkAllowed()).toBe(false)
    await Promise.resolve()
    expect(isUploadNetworkAllowed()).toBe(false)
  })
})
