import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  dragSelection,
  edgeScrollDelta,
  selectionDiff,
} from '@/features/media-batch/model/drag-range'
import type { DaySelection } from '@/features/journey-workspace/ui/day/use-day-selection'

export const LONG_PRESS_MS = 400
export const MOVE_CANCEL_PX = 10
/** Attribute of a tile that carries its media id. */
export const MEDIA_ID_ATTR = 'data-media-id'

interface DragSelectOptions {
  enabled: boolean
  /** Flat reading order of the tiles that are shown. */
  order: readonly string[]
  selection: DaySelection
}

interface Gesture {
  anchor: string
  base: ReadonlySet<string>
  /** What the drag has put into the selection so far. */
  applied: ReadonlySet<string>
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  timer: ReturnType<typeof setTimeout> | null
  frame: number | null
}

function tileIdAt(x: number, y: number): string | null {
  const hit = document.elementFromPoint(x, y)
  const tile = hit?.closest(`[${MEDIA_ID_ATTR}]`)
  return tile?.getAttribute(MEDIA_ID_ATTR) ?? null
}

/**
 * Press-and-hold (touch / pen) starts selecting; dragging then selects the
 * contiguous range in reading order from the held tile to the tile under the
 * pointer. The mouse keeps click / Shift-click. Spread `gridProps` on the grid
 * wrapper and set `ref` on it.
 *
 * Real touch behaviour (scroll locking, the iOS callout) cannot be unit
 * tested; it needs a device.
 */
export function useDragSelect({
  enabled,
  order,
  selection,
}: DragSelectOptions) {
  const [dragging, setDragging] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ order, selection })
  useEffect(() => {
    latest.current = { order, selection }
  })

  const stopFrame = (g: Gesture) => {
    if (g.frame !== null) cancelAnimationFrame(g.frame)
    g.frame = null
  }

  const apply = useCallback((g: Gesture, currentId: string) => {
    const { order: flat, selection: sel } = latest.current
    const next = dragSelection(g.base, flat, g.anchor, currentId)
    const { add, remove } = selectionDiff(g.applied, next)
    if (add.length > 0) sel.setMany(add, true)
    if (remove.length > 0) sel.setMany(remove, false)
    g.applied = next
  }, [])

  const update = useCallback(
    (g: Gesture) => {
      const id = tileIdAt(g.x, g.y)
      if (id !== null) apply(g, id)
    },
    [apply],
  )

  // The scroll loop re-enters itself each frame, hence the ref.
  const tickRef = useRef<(g: Gesture) => void>(() => undefined)
  useEffect(() => {
    tickRef.current = (g: Gesture) => {
      g.frame = null
      if (!g.active) return
      const delta = edgeScrollDelta(g.y, window.innerHeight)
      if (delta !== 0) {
        window.scrollBy({ behavior: 'instant', left: 0, top: delta })
        update(g)
      }
      g.frame = requestAnimationFrame(() => {
        tickRef.current(g)
      })
    }
  })

  const finish = useCallback((hadDrag: boolean) => {
    const g = gesture.current
    gesture.current = null
    if (g === null) return
    if (g.timer !== null) clearTimeout(g.timer)
    stopFrame(g)
    if (!hadDrag) return
    setDragging(false)
    // The click that follows the release must not open or toggle a tile.
    suppressClick.current = true
    if (suppressTimer.current !== null) clearTimeout(suppressTimer.current)
    suppressTimer.current = setTimeout(() => {
      suppressClick.current = false
    }, 350)
  }, [])

  useEffect(
    () => () => {
      const g = gesture.current
      if (g !== null) {
        if (g.timer !== null) clearTimeout(g.timer)
        stopFrame(g)
      }
      if (suppressTimer.current !== null) clearTimeout(suppressTimer.current)
    },
    [],
  )

  // While a drag selection is active the page must not scroll under the finger.
  useEffect(() => {
    const node = gridRef.current
    if (!dragging || node === null) return
    const block = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()
    }
    node.addEventListener('touchmove', block, { passive: false })
    return () => {
      node.removeEventListener('touchmove', block)
    }
  }, [dragging])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    if (gesture.current !== null) return
    const tile = (event.target as Element).closest(`[${MEDIA_ID_ATTR}]`)
    const id = tile?.getAttribute(MEDIA_ID_ATTR) ?? null
    if (id === null) return
    const g: Gesture = {
      active: false,
      anchor: id,
      applied: new Set(),
      base: new Set(),
      frame: null,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: null,
      x: event.clientX,
      y: event.clientY,
    }
    g.timer = setTimeout(() => {
      g.timer = null
      const { selection: sel } = latest.current
      g.active = true
      g.base = new Set(sel.ids)
      sel.setMode(true)
      sel.setMany([id], true)
      g.applied = new Set([...g.base, id])
      setDragging(true)
      g.frame = requestAnimationFrame(() => {
        tickRef.current(g)
      })
    }, LONG_PRESS_MS)
    gesture.current = g
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (g?.pointerId !== event.pointerId) return
    g.x = event.clientX
    g.y = event.clientY
    if (!g.active) {
      // Moving before the timer fires means the user wants to scroll.
      if (Math.hypot(g.x - g.startX, g.y - g.startY) > MOVE_CANCEL_PX) {
        finish(false)
      }
      return
    }
    if (event.cancelable) event.preventDefault()
    update(g)
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (g?.pointerId !== event.pointerId) return
    finish(g.active)
  }

  return {
    dragging,
    gridProps: {
      onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      },
      onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
        // iOS / Android show a context menu on long press of an image.
        if (gesture.current !== null) event.preventDefault()
      },
      onPointerCancel: onPointerEnd,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
    },
    ref: gridRef,
  }
}
