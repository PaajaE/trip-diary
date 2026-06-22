const cellularSyncKey = 'trip-diary:sync-on-cellular'

export function isCellularSyncEnabled(): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  return localStorage.getItem(cellularSyncKey) === '1'
}

export function setCellularSyncEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  if (enabled) {
    localStorage.setItem(cellularSyncKey, '1')
    return
  }

  localStorage.removeItem(cellularSyncKey)
}
