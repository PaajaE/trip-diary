import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PropsWithChildren,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { clampPanelPosition } from '@/shared/ui/anchored-panel-position'

const MAX_PANEL_WIDTH_PX = 320

interface AnchoredPanelProps extends PropsWithChildren {
  anchorRef: RefObject<HTMLElement | null>
  className?: string
  onClose: () => void
  open: boolean
  role?: 'dialog' | 'menu'
}

export function AnchoredPanel({
  anchorRef,
  children,
  className,
  onClose,
  open,
  role = 'dialog',
}: AnchoredPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || panelRef.current === null) {
      return
    }

    function updatePosition() {
      const panelElement = panelRef.current
      const trigger = anchorRef.current?.getBoundingClientRect()
      if (panelElement === null || trigger === undefined) {
        return
      }

      const { left, top, width } = clampPanelPosition(
        trigger,
        MAX_PANEL_WIDTH_PX,
      )
      panelElement.style.position = 'fixed'
      panelElement.style.left = `${String(left)}px`
      panelElement.style.top = `${String(top)}px`
      panelElement.style.width = `${String(width)}px`
      panelElement.style.zIndex = '50'
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, open])

  useEffect(() => {
    if (!open) {
      return
    }

    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (
        panelRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return
      }
      onClose()
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [anchorRef, onClose, open])

  if (!open) {
    return null
  }

  return createPortal(
    <div className={className} ref={panelRef} role={role}>
      {children}
    </div>,
    document.body,
  )
}
