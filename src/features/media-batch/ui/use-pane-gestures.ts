import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import {
  cycleZoom,
  panBy,
  zoomAt,
  type Point,
  type Size,
} from '@/features/media-batch/model/zoom'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'

const TAP_MS = 300
const TAP_SLOP_PX = 24
const WHEEL_SENSITIVITY = 0.003

export interface PaneGestureHandlers {
  onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
}

/**
 * Zoom gestures of one compare pane: pinch, drag, Ctrl + wheel, double tap
 * (touch) and double click (mouse). The zoom is shared through `api`.
 */
export function usePaneGestures({
  api,
  enabled,
  fit,
  fitScale,
  size,
  viewport,
}: {
  api: PhotoCompareApi
  /** False for a video: its own controls get the pointer. */
  enabled: boolean
  fit: Size
  fitScale: number
  size: Size
  viewport: RefObject<HTMLDivElement | null>
}): PaneGestureHandlers {
  const pointers = useRef(new Map<number, Point>())
  const pinch = useRef<number | null>(null)
  const tap = useRef<{ at: number; moved: boolean; x: number; y: number }>({
    at: 0,
    moved: false,
    x: 0,
    y: 0,
  })
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null)
  const pointerKind = useRef('mouse')
  const touchDoubleAt = useRef(0)

  const offsetOf = (clientX: number, clientY: number): Point => {
    const rect = viewport.current?.getBoundingClientRect()
    return rect === undefined
      ? { x: 0, y: 0 }
      : {
          x: clientX - (rect.left + rect.width / 2),
          y: clientY - (rect.top + rect.height / 2),
        }
  }
  const cycleAt = (at: Point) => {
    api.setZoom((current) => cycleZoom(current, at, fit, size, fitScale))
  }

  // Ctrl + wheel (also a trackpad pinch). Native listener: it must not be passive.
  const onWheel = useRef<(event: WheelEvent) => void>(() => undefined)
  useEffect(() => {
    onWheel.current = (event) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const at = offsetOf(event.clientX, event.clientY)
      const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY)
      api.setZoom((current) =>
        zoomAt(current, current.k * factor, at, fit, size, fitScale),
      )
    }
  })
  useEffect(() => {
    const node = viewport.current
    if (node === null || !enabled) return
    const listener = (event: WheelEvent) => {
      onWheel.current(event)
    }
    node.addEventListener('wheel', listener, { passive: false })
    return () => {
      node.removeEventListener('wheel', listener)
    }
  }, [enabled, viewport])

  const distance = () => {
    const [p, q] = [...pointers.current.values()]
    return p === undefined || q === undefined
      ? 0
      : Math.hypot(p.x - q.x, p.y - q.y)
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerKind.current = event.pointerType
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Not capturable (synthetic event): dragging still works inside the pane.
    }
    if (pointers.current.size === 2) {
      pinch.current = distance()
      tap.current.moved = true
    } else {
      tap.current = {
        at: event.timeStamp,
        moved: false,
        x: event.clientX,
        y: event.clientY,
      }
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (previous === undefined) return
    const next = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, next)
    if (pointers.current.size === 2) {
      const now = distance()
      const before = pinch.current
      pinch.current = now
      if (before === null || before <= 0 || now <= 0) return
      const [p, q] = [...pointers.current.values()]
      if (p === undefined || q === undefined) return
      const at = offsetOf((p.x + q.x) / 2, (p.y + q.y) / 2)
      const ratio = now / before
      api.setZoom((current) =>
        zoomAt(current, current.k * ratio, at, fit, size, fitScale),
      )
      return
    }
    if (
      Math.hypot(next.x - tap.current.x, next.y - tap.current.y) > TAP_SLOP_PX
    )
      tap.current.moved = true
    if (api.zoomed) {
      api.setZoom((current) =>
        panBy(current, next.x - previous.x, next.y - previous.y, fit, size),
      )
    }
  }
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const had = pointers.current.delete(event.pointerId)
    pinch.current = null
    if (
      !had ||
      event.type === 'pointercancel' ||
      event.pointerType !== 'touch' ||
      tap.current.moved ||
      event.timeStamp - tap.current.at > TAP_MS
    )
      return
    // Double tap (a native dblclick is unreliable on touch).
    const previous = lastTap.current
    if (
      previous !== null &&
      event.timeStamp - previous.at < TAP_MS * 1.5 &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <
        TAP_SLOP_PX * 2
    ) {
      lastTap.current = null
      touchDoubleAt.current = event.timeStamp
      cycleAt(offsetOf(event.clientX, event.clientY))
    } else {
      lastTap.current = {
        at: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
      }
    }
  }

  return {
    onDoubleClick: (event) => {
      if (
        !enabled ||
        pointerKind.current !== 'mouse' ||
        event.timeStamp - touchDoubleAt.current < 600
      )
        return
      cycleAt(offsetOf(event.clientX, event.clientY))
    },
    onPointerCancel: onPointerEnd,
    ...(enabled ? { onPointerDown, onPointerMove } : {}),
    onPointerUp: onPointerEnd,
  }
}
