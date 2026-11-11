/** Fired on `window` when the cellular preference changes. */
export const CELLULAR_SYNC_EVENT = 'trip-diary:cellular-sync-changed'

const cellularSyncKey = 'trip-diary:sync-on-cellular'

/** Wi-Fi only by default; mobile data needs the author's explicit opt-in. */
export function isCellularSyncEnabled(): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  const preference = localStorage.getItem(cellularSyncKey)
  if (preference === null) {
    return false
  }

  return preference === '1'
}

export function setCellularSyncEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(cellularSyncKey, enabled ? '1' : '0')
  window.dispatchEvent(new Event(CELLULAR_SYNC_EVENT))
}
