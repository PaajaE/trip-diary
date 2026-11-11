import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { isBrowserOnline } from '@/shared/lib/network'
import {
  CELLULAR_SYNC_EVENT,
  isCellularSyncEnabled,
} from '@/shared/sync/sync-preferences'

/**
 * Wi-Fi-only uploads (native only): the queue waits while the phone is on
 * mobile data, unless the author allowed it in the upload settings. The
 * connection type is read asynchronously, so a module cache answers the queue's
 * synchronous `isOnline` question. Until the type is known the answer is "not
 * allowed" (a wrongly started cellular upload costs the author money; a short
 * wait does not), and listeners are told as soon as it is known.
 * Native behaviour UNVERIFIED on a device.
 */
type ConnectionKind = 'cellular' | 'none' | 'other' | 'wifi'

let connection: ConnectionKind | null = null
let watching = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function toKind(status: { connected: boolean; connectionType: string }) {
  if (!status.connected) return 'none'
  return status.connectionType === 'wifi' ||
    status.connectionType === 'cellular'
    ? status.connectionType
    : 'other'
}

function watch(): void {
  if (watching || !Capacitor.isNativePlatform()) return
  watching = true
  Network.getStatus().then(
    (status) => {
      connection = toKind(status)
      notify()
    },
    () => {
      // Unknown stays blocked unless mobile data was allowed explicitly.
      connection = null
    },
  )
  void Network.addListener('networkStatusChange', (status) => {
    connection = toKind(status)
    notify()
  })
}

/** Test seam: forget the cached connection and listeners. */
export function resetUploadNetworkForTests(): void {
  connection = null
  watching = false
  listeners.clear()
}

/** Whether an upload may use the current network. */
export function isUploadNetworkAllowed(): boolean {
  if (!isBrowserOnline()) return false
  if (!Capacitor.isNativePlatform()) return true
  watch()
  if (isCellularSyncEnabled()) return true
  return connection === 'wifi' || connection === 'other'
}

/**
 * Why an upload waits right now: no connection at all, or mobile data that was
 * not allowed. Null when it may run.
 */
export function uploadWaitReason(): 'offline' | 'wifi' | null {
  if (!isBrowserOnline()) return 'offline'
  return isUploadNetworkAllowed() ? null : 'wifi'
}

/**
 * Calls back when the connection type changes, when it becomes known, when
 * the browser comes online and when the cellular setting is toggled.
 */
export function onUploadNetworkChange(callback: () => void): () => void {
  watch()
  listeners.add(callback)
  window.addEventListener('online', callback)
  window.addEventListener(CELLULAR_SYNC_EVENT, callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('online', callback)
    window.removeEventListener(CELLULAR_SYNC_EVENT, callback)
  }
}

/** True when uploads are limited to Wi-Fi right now (for the flow's notes). */
export function isWifiOnlyUpload(): boolean {
  return Capacitor.isNativePlatform() && !isCellularSyncEnabled()
}
