import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { useEffect, useState } from 'react'
import { isBrowserOnline } from '@/shared/lib/network'

/** Live online/offline state (browser events, plus the Network plugin on native). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isBrowserOnline)
  useEffect(() => {
    const update = () => {
      setOnline(isBrowserOnline())
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    let removeNative: (() => void) | undefined
    let disposed = false
    if (Capacitor.isNativePlatform()) {
      void Network.addListener('networkStatusChange', (status) => {
        setOnline(status.connected)
      })
        .then((handle) => {
          if (disposed) void handle.remove()
          else removeNative = () => void handle.remove()
        })
        .catch(() => undefined)
    }
    return () => {
      disposed = true
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      removeNative?.()
    }
  }, [])
  return online
}
