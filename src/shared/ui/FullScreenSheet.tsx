import { X } from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'
import { useBodyScrollLock } from '@/shared/lib/use-body-scroll-lock'

interface FullScreenSheetProps {
  children: ReactNode
  closeLabel: string
  onClose: () => void
  open: boolean
  scrollable?: boolean
  title: string
}

export function FullScreenSheet({
  children,
  closeLabel,
  onClose,
  open,
  scrollable = true,
  title,
}: FullScreenSheetProps) {
  const titleId = useId()
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-sm font-semibold" id={titleId}>
          {title}
        </p>
        <button
          aria-label={closeLabel}
          autoFocus
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-surface"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <div
        className={
          scrollable
            ? 'min-h-0 flex-1 overflow-y-auto px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8'
            : 'flex min-h-0 flex-1 flex-col'
        }
      >
        {children}
      </div>
    </div>
  )
}
