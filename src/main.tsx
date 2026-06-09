import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import '@/app/i18n'
import './index.css'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing #root element')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
