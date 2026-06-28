import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

const VIEWPORT_PADDING_PX = 20
const PANEL_GAP_PX = 8
const MAX_PANEL_WIDTH_PX = 320

export function clampPanelPosition(
  trigger: DOMRect,
  panelWidth: number,
): { left: number; top: number; width: number } {
  const width = Math.min(
    MAX_PANEL_WIDTH_PX,
    panelWidth,
    window.innerWidth - VIEWPORT_PADDING_PX * 2,
  )
  const preferredLeft = trigger.right - width
  const left = Math.min(
    Math.max(VIEWPORT_PADDING_PX, preferredLeft),
    window.innerWidth - width - VIEWPORT_PADDING_PX,
  )
  const top = trigger.bottom + PANEL_GAP_PX

  return { left, top, width }
}

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
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }

    function updatePosition() {
      const trigger = anchorRef.current?.getBoundingClientRect()
      if (trigger === undefined) {
        return
      }

      const { left, top, width } = clampPanelPosition(
        trigger,
        MAX_PANEL_WIDTH_PX,
      )
      setStyle({
        left: `${left}px`,
        position: 'fixed',
        top: `${top}px`,
        width: `${width}px`,
        zIndex: 50,
      })
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

  if (!open || style === null) {
    return null
  }

  return createPortal(
    <div className={className} ref={panelRef} role={role} style={style}>
      {children}
    </div>,
    document.body,
  )
}
