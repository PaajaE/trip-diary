import { createContext } from 'react'

export interface ShowToastOptions {
  duration?: number
  message: string
  variant?: 'default' | 'error'
}

export const ToastContext = createContext<{
  showToast: (options: ShowToastOptions) => void
} | null>(null)
