import { useEffect, useRef } from 'react'
import {
  ignoredKey,
  isControlTarget,
} from '@/features/media-batch/ui/sort-keys'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'

export interface QuickSortKeyHandlers {
  accept: () => void
  compare: PhotoCompareApi
  navigate: (delta: 1 | -1) => void
  onClose: () => void
  openSeriesView: () => void
  overlay: 'none' | 'change' | 'series' | 'summary'
  requestExit: () => void
  star: () => void
  trash: () => void
  undo: () => void
}

/**
 * Shortcuts of "Rychlé třídění": S star, X / Delete trash, Enter accept,
 * U undo, G series, arrows move, Esc finishes. Compare and zoom own C, Z,
 * [ ], Tab and the first Esc presses; overlays own their keys.
 */
export function useQuickSortKeys(handlers: QuickSortKeyHandlers): void {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (ignoredKey(event)) return
      const target = event.target
      const now = latest.current
      if (now.overlay === 'series') return // the series view owns Esc
      if (now.overlay === 'summary') {
        if (event.key === 'Escape') {
          event.preventDefault()
          now.onClose()
        }
        return
      }
      // The "Move to" sheet owns every key (Esc included) while it is open.
      if (now.overlay === 'change') return
      const run = (fn: () => void, repeatable = false) => {
        event.preventDefault()
        if (event.repeat && !repeatable) return
        fn()
      }
      if (now.compare.handleKey(event)) {
        event.preventDefault()
        return
      }
      switch (event.key) {
        case 'Escape':
          run(now.requestExit)
          break
        case 'ArrowLeft':
          run(() => {
            now.navigate(-1)
          }, true)
          break
        case 'ArrowRight':
          run(() => {
            now.navigate(1)
          }, true)
          break
        case 's':
        case 'S':
          run(now.star)
          break
        case 'x':
        case 'X':
        case 'Delete':
          run(now.trash)
          break
        case 'Enter':
          if (isControlTarget(target)) return
          run(now.accept)
          break
        case 'u':
        case 'U':
          run(now.undo)
          break
        case 'g':
        case 'G':
          run(now.openSeriesView)
          break
        default:
          break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
