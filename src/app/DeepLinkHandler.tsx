import { useEffect } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { resolveDeepLinkPath } from '@/app/deep-link'
import { router } from '@/app/router'

export function DeepLinkHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    const listener = NativeApp.addListener('appUrlOpen', ({ url }) => {
      const path = resolveDeepLinkPath(url)
      if (path !== null) {
        router.history.push(path)
      }
    })

    return () => {
      void listener.then((handle) => handle.remove())
    }
  }, [])

  return null
}
