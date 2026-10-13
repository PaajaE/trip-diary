import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { cn } from '@/shared/lib/cn'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

interface ToastItem {
  action: ShowToastOptions['action']
  id: number
  message: string
  variant: 'default' | 'error'
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    ({
      action,
      duration = 2500,
      message,
      variant = 'default',
    }: ShowToastOptions) => {
      nextId.current += 1
      const id = nextId.current
      setToasts((current) => [...current, { action, id, message, variant }])
      window.setTimeout(() => {
        dismiss(id)
      }, duration)
    },
    [dismiss],
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
          <div
            className={cn(
              'flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg',
              toast.variant === 'error'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-foreground text-background',
            )}
            key={toast.id}
            role="status"
          >
            <span>{toast.message}</span>
            {toast.action !== undefined ? (
              <button
                className="pointer-events-auto min-h-10 shrink-0 rounded-md px-3 font-semibold underline"
                type="button"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
