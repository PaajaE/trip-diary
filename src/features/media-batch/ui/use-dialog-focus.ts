import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), video[controls], [href], [tabindex]:not([tabindex="-1"])'

/**
 * Full-screen dialog focus: focus in, trap Tab inside the topmost layer
 * (inert layers are skipped), lock the page scroll, return focus on close.
 */
export function useDialogFocus(
  rootRef: RefObject<HTMLElement | null>,
  returnFocusTo: HTMLElement | null = null,
): void {
  useEffect(() => {
    const opener = returnFocusTo ?? document.activeElement
    const node = rootRef.current
    node?.focus({ preventScroll: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || node === null) return
      const entries = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.closest('[inert]') === null,
      )
      const first = entries[0]
      const last = entries[entries.length - 1]
      if (first === undefined || last === undefined) return
      const active = document.activeElement
      if (
        !node.contains(active) ||
        (active instanceof HTMLElement && active.closest('[inert]') !== null)
      ) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [returnFocusTo, rootRef])
}
