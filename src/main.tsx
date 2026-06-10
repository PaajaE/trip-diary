import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from '@/app/App'
import '@/app/i18n'
import './index.css'

registerSW({ immediate: true })

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing #root element')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
