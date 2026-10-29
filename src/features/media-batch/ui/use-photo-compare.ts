import { useCallback, useMemo, useRef, useState } from 'react'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  nearestInTime,
  orderedCandidates,
  stepPartner,
} from '@/features/media-batch/model/compare'
import {
  cycleZoom,
  FIT_VIEW,
  isZoomed,
  zoomLevelOf,
  zoomToLevel,
  type Size,
  type ZoomLevel,
  type ZoomView,
} from '@/features/media-batch/model/zoom'

/** Geometry of the A pane, reported by the view for keyboard zoom. */
export interface PaneMetrics {
  fit: Size
  fitScale: number
  pane: Size
}

export interface PhotoCompareApi {
  /** Compare is on and there is a partner. */
  active: boolean
  canCompare: boolean
  on: boolean
  partner: MediaItem | undefined
  swapped: boolean
  zoom: ZoomView
  zoomed: boolean
  /** The A pane reports its geometry here (used by the Z key). */
  reportMetrics: (metrics: PaneMetrics) => void
  setZoom: (update: (view: ZoomView) => ZoomView) => void
  step: (delta: 1 | -1) => void
  swap: () => void
  toggle: () => void
  /** Z: one step of the zoom cycle at the centre of the pane. */
  cycle: () => void
  /** The preset the zoom sits on ("Celá", 100 %, 200 %), null in between. */
  level: ZoomLevel | null
  /** Makes `id` the partner (the candidate strip). */
  pick: (id: string) => void
  /** Jumps to a preset around the centre of the pane. */
  zoomTo: (level: ZoomLevel) => void
  /**
   * Keys owned by compare and zoom: C, Z, [ ], Tab (swap) and Esc (leave zoom,
   * then compare). Returns true when the key was used.
   */
  handleKey: (event: KeyboardEvent) => boolean
}

const OWNED_REPEATING = new Set(['c', 'C', 'z', 'Z', '[', ']', 'Tab'])

interface MainState {
  forId: string
  partnerId: string | null
  swapped: boolean
  view: ZoomView
}

const freshState = (forId: string): MainState => ({
  forId,
  partnerId: null,
  swapped: false,
  view: FIT_VIEW,
})

/** Tab swaps only outside the controls: focus on the page or the photo area. */
function tabMaySwap(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true
  return (
    target === document.body ||
    target.hasAttribute('data-compare-stage') ||
    target.getAttribute('role') === 'dialog'
  )
}

/**
 * State of the shared compare + zoom view for one "main" photo (A). The zoom
 * belongs to the main photo and resets when another one becomes main.
 */
export function usePhotoCompare(
  main: MediaItem | undefined,
  pool: readonly MediaItem[],
  /** The compare duel: always two photos, no on / off. */
  options: { alwaysOn?: boolean } = {},
): PhotoCompareApi {
  const mainId = main?.id ?? ''
  const [toggled, setOn] = useState(false)
  const on = options.alwaysOn === true || toggled
  const [fitScale, setFitScale] = useState(1)
  // Everything that belongs to one main photo: reset when another one is main
  // (so going A -> B -> A does not bring A's zoom or partner back).
  const [store, setStore] = useState<MainState>(() => freshState(mainId))
  if (store.forId !== mainId) setStore(freshState(mainId))
  const current = store.forId === mainId ? store : freshState(mainId)
  const { partnerId, swapped } = current
  const zoom = current.view
  const metrics = useRef<PaneMetrics | null>(null)
  const candidates = useMemo(
    () => (main === undefined ? [] : orderedCandidates(main, pool)),
    [main, pool],
  )
  const partner =
    candidates.find((item) => item.id === partnerId) ??
    (main === undefined ? undefined : nearestInTime(main, candidates))
  const canCompare = candidates.length > 0

  const setZoom = useCallback(
    (update: (view: ZoomView) => ZoomView) => {
      setStore((prev) => {
        const base = prev.forId === mainId ? prev : freshState(mainId)
        return { ...base, view: update(base.view) }
      })
    },
    [mainId],
  )
  const setSwapped = (update: (value: boolean) => boolean) => {
    setStore((prev) => {
      const base = prev.forId === mainId ? prev : freshState(mainId)
      return { ...base, swapped: update(base.swapped) }
    })
  }
  const step = (delta: 1 | -1) => {
    const next = stepPartner(candidates, partner?.id, delta)
    if (next !== undefined) {
      setStore((prev) => ({
        ...(prev.forId === mainId ? prev : freshState(mainId)),
        partnerId: next.id,
      }))
    }
  }
  const cycle = () => {
    const m = metrics.current
    setZoom((view) =>
      m === null
        ? cycleZoom(view, { x: 0, y: 0 }, { h: 0, w: 0 }, { h: 0, w: 0 }, 1)
        : cycleZoom(view, { x: 0, y: 0 }, m.fit, m.pane, m.fitScale),
    )
  }
  const reportMetrics = useCallback((next: PaneMetrics) => {
    metrics.current = next
    setFitScale(next.fitScale)
  }, [])
  const toggle = () => {
    setOn((value) => (value ? false : canCompare))
  }
  const zoomTo = (level: ZoomLevel) => {
    const m = metrics.current
    if (m === null) return
    setZoom((view) => zoomToLevel(view, level, m.fit, m.pane, m.fitScale))
  }
  const pick = (id: string) => {
    if (!candidates.some((item) => item.id === id)) return
    setStore((prev) => ({
      ...(prev.forId === mainId ? prev : freshState(mainId)),
      partnerId: id,
    }))
  }
  const active = on && partner !== undefined
  const zoomed = isZoomed(zoom)

  const handleKey = (event: KeyboardEvent): boolean => {
    const target = event.target
    // Held keys must not flip compare or zoom back and forth.
    if (event.repeat && OWNED_REPEATING.has(event.key)) return true
    switch (event.key) {
      case 'Escape':
        if (zoomed) setZoom(() => FIT_VIEW)
        else if (toggled && options.alwaysOn !== true) setOn(false)
        else return false
        return true
      case 'c':
      case 'C':
        toggle()
        return true
      case 'z':
      case 'Z':
        cycle()
        return true
      case '[':
      case ']':
        if (!active) return false
        step(event.key === ']' ? 1 : -1)
        return true
      case 'Tab':
        if (!active || event.shiftKey || !tabMaySwap(target)) return false
        setSwapped((value) => !value)
        return true
      default:
        return false
    }
  }

  return {
    active,
    canCompare,
    cycle,
    handleKey,
    level: zoomLevelOf(zoom.k, fitScale),
    on,
    partner,
    pick,
    reportMetrics,
    setZoom,
    step,
    swap: () => {
      setSwapped((value) => !value)
    },
    swapped,
    toggle,
    zoom,
    zoomTo,
    zoomed,
  }
}
