import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useBodyScrollLock } from '@/shared/lib/use-body-scroll-lock'
import { cn } from '@/shared/lib/cn'

interface SoftBottomSheetProps {
  children: ReactNode
  closeLabel: string
  onClose: () => void
  open: boolean
  size?: 'default' | 'wide'
  title: string
}

export function SoftBottomSheet({
  children,
  closeLabel,
  onClose,
  open,
  size = 'default',
  title,
}: SoftBottomSheetProps) {
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) {
      return
    }

    closeButtonRef.current?.focus()

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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        aria-label={closeLabel}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          'relative flex max-h-[min(85svh,720px)] w-full flex-col rounded-t-3xl border border-border bg-surface shadow-soft sm:max-h-[min(85svh,40rem)] sm:rounded-3xl',
          size === 'wide' ? 'max-w-lg sm:max-w-2xl' : 'max-w-lg',
        )}
        role="dialog"
      >
        <div className="flex shrink-0 justify-center pt-3 sm:hidden">
          <div aria-hidden="true" className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-2">
          <p className="text-base font-semibold" id={titleId}>
            {title}
          </p>
          <button
            aria-label={closeLabel}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted hover:bg-background"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
