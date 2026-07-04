import { useContext } from 'react'
import { ToastContext } from '@/shared/ui/toast-context'

export function useToast() {
  const context = useContext(ToastContext)
  if (context === null) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
