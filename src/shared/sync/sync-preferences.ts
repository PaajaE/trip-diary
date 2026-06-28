const cellularSyncKey = 'trip-diary:sync-on-cellular'

export function isCellularSyncEnabled(): boolean {
  if (typeof localStorage === 'undefined') {
    return true
  }

  const preference = localStorage.getItem(cellularSyncKey)
  if (preference === null) {
    return true
  }

  return preference === '1'
}

export function setCellularSyncEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(cellularSyncKey, enabled ? '1' : '0')
}
