import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { isCellularSyncEnabled } from '@/shared/sync/sync-preferences'

export async function canAutomaticallySync(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return navigator.onLine
  }

  const status = await Network.getStatus()
  if (!status.connected) {
    return false
  }

  if (status.connectionType === 'wifi') {
    return true
  }

  return isCellularSyncEnabled()
}
