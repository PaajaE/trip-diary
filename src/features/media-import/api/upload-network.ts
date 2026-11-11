import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { isBrowserOnline } from '@/shared/lib/network'
import { isCellularSyncEnabled } from '@/shared/sync/sync-preferences'

/**
 * Wi-Fi-only uploads (native only): the queue waits while the phone is on
 * mobile data, unless the author allowed it in the upload settings. The
 * connection type is read asynchronously, so a module cache answers the queue's
 * synchronous `isOnline` question. Native behaviour UNVERIFIED on a device.
 */
let connectionType: string | null = null
let watching = false

function watch(): void {
  if (watching || !Capacitor.isNativePlatform()) return
  watching = true
  void Network.getStatus().then((status) => {
    connectionType = status.connected ? status.connectionType : 'none'
  })
  void Network.addListener('networkStatusChange', (status) => {
    connectionType = status.connected ? status.connectionType : 'none'
    for (const listener of listeners) listener()
  })
}

const listeners = new Set<() => void>()

/** Whether an upload may use the current network. */
export function isUploadNetworkAllowed(): boolean {
  if (!isBrowserOnline()) return false
  if (!Capacitor.isNativePlatform()) return true
  watch()
  if (connectionType !== 'cellular') return true
  return isCellularSyncEnabled()
}

/** Calls back when the connection type changes (and on browser "online"). */
export function onUploadNetworkChange(callback: () => void): () => void {
  watch()
  listeners.add(callback)
  window.addEventListener('online', callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('online', callback)
  }
}

/** True when uploads are limited to Wi-Fi right now (for the flow's notes). */
export function isWifiOnlyUpload(): boolean {
  return Capacitor.isNativePlatform() && !isCellularSyncEnabled()
}
