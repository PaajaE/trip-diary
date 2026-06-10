import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

export async function canAutomaticallySync(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return navigator.onLine
  }

  const status = await Network.getStatus()
  return status.connected && status.connectionType === 'wifi'
}
