import { useCallback, useEffect, useState } from 'react'
import {
  clampMapWidth,
  isShortcutBlocked,
  MAP_W_DEFAULT,
  RAIL_W_COLLAPSED,
  RAIL_W_OPEN,
  readStoredLayout,
  storeLayout,
  type MapMode,
  type WidthBounds,
  mapWidthBounds,
} from '@/features/journey-workspace/lib/workspace-layout'

/** Row width used until the grid has been measured (and in tests). */
const FALLBACK_ROW_WIDTH = 1200

/**
 * Layout state of the overview: stage rail, map panel mode and width. The
 * choice is remembered per browser; the full-screen map lives in the URL.
 */
export function useWorkspaceLayout({
  mapShortcut,
  railShortcut,
}: {
  mapShortcut: boolean
  railShortcut: boolean
}) {
  const [layout, setLayout] = useState(readStoredLayout)
  const [rowWidth, setRowWidth] = useState(FALLBACK_ROW_WIDTH)

  useEffect(() => {
    storeLayout(layout)
  }, [layout])

  // Ref callback for the grid row; its width bounds the map panel.
  const attachRow = useCallback((element: HTMLElement | null) => {
    if (element === null) return
    const measure = () => {
      const width = element.getBoundingClientRect().width
      if (width > 0) setRowWidth(width)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  const railWidth = layout.rail === 'open' ? RAIL_W_OPEN : RAIL_W_COLLAPSED
  const bounds: WidthBounds = mapWidthBounds(rowWidth, railWidth)
  const mapW = clampMapWidth(layout.mapW, rowWidth, railWidth, false)

  const toggleRail = useCallback(() => {
    setLayout((l) => ({
      ...l,
      rail: l.rail === 'open' ? 'collapsed' : 'open',
    }))
  }, [])
  const setMap = useCallback((map: MapMode) => {
    setLayout((l) => ({ ...l, map }))
  }, [])
  const setMapWidth = useCallback(
    (width: number, snap: boolean) => {
      setLayout((l) => ({
        ...l,
        mapW: clampMapWidth(
          width,
          rowWidth,
          l.rail === 'open' ? RAIL_W_OPEN : RAIL_W_COLLAPSED,
          snap,
        ),
      }))
    },
    [rowWidth],
  )
  const resetMapWidth = useCallback(() => {
    setLayout((l) => ({ ...l, mapW: MAP_W_DEFAULT }))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event)) return
      if (event.key === '[' && railShortcut) {
        event.preventDefault()
        toggleRail()
      } else if (event.key.toLowerCase() === 'm' && mapShortcut) {
        event.preventDefault()
        setLayout((l) => ({
          ...l,
          map: l.map === 'panel' ? 'hidden' : 'panel',
        }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [mapShortcut, railShortcut, toggleRail])

  return {
    bounds,
    map: layout.map,
    mapW,
    rail: layout.rail,
    resetMapWidth,
    attachRow,
    rowWidth,
    setMap,
    setMapWidth,
    toggleRail,
  }
}
