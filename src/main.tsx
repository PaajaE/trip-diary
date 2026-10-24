import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { registerSW } from 'virtual:pwa-register'
import { App } from '@/app/App'
import { releasePrerenderShell } from '@/app/prerender-shell'
import { RootErrorBoundary } from '@/app/RootErrorBoundary'
import { initTheme } from '@/shared/lib/theme'
import '@/app/i18n'
import './index.css'

if (!Capacitor.isNativePlatform() && import.meta.env.VITE_E2E !== '1') {
  // Service worker registration is not needed for first paint: after load, idle.
  const register = () => {
    const run = () => {
      registerSW({ immediate: true })
    }
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 5000 })
    } else {
      window.setTimeout(run, 1000)
    }
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

initTheme()

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing #root element')
}

// Safety net: never leave a prerendered shell covering a failed render.
window.setTimeout(releasePrerenderShell, 8000)

createRoot(rootElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
