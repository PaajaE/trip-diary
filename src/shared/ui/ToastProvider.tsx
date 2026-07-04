import { useCallback, useMemo, useState, type PropsWithChildren } from 'react'
import { cn } from '@/shared/lib/cn'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

interface ToastItem {
  id: number
  message: string
  variant: 'default' | 'error'
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback(
    ({ duration = 2500, message, variant = 'default' }: ShowToastOptions) => {
      const id = Date.now()
      setToasts((current) => [...current, { id, message, variant }])
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, duration)
    },
    [],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-5"
      >
        {toasts.map((toast) => (
          <p
            className={cn(
              'rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg',
              toast.variant === 'error'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-foreground text-background',
            )}
            key={toast.id}
            role="status"
          >
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
