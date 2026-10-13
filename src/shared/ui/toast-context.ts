import { createContext } from 'react'

export interface ShowToastOptions {
  /** Optional single action button (e.g. Undo); dismisses the toast on click. */
  action?: { label: string; onClick: () => void }
  duration?: number
  message: string
  variant?: 'default' | 'error'
}

export const ToastContext = createContext<{
  showToast: (options: ShowToastOptions) => void
} | null>(null)
