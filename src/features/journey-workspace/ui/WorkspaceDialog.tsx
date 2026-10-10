import { useEffect, useId, useRef } from 'react'
import type { PropsWithChildren } from 'react'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * Minimal modal: labelled dialog, focus moves in on open and returns to the
 * opener on close, Tab is trapped, Escape closes it.
 */
export function WorkspaceDialog({
  children,
  onClose,
  title,
}: PropsWithChildren<{ onClose: () => void; title: string }>) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement
    const node = ref.current
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || node === null) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (first === undefined || last === undefined) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
        ref={ref}
        role="dialog"
      >
        <h2 className="text-lg font-semibold" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

export const dialogButton =
  'min-h-10 min-w-10 rounded-md border border-border px-3 py-1.5 font-semibold disabled:opacity-50'
