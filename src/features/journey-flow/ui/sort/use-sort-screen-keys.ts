import { useEffect, useRef } from 'react'
import { ignoredKey } from '@/features/media-batch/ui/sort-keys'

export interface SortScreenKeys {
  /** An overlay (series, compare, move sheet, day end) owns the keys. */
  blocked: boolean
  best: () => void
  compare: () => void
  /** Esc: leave zoom, then full screen. Returns false when nothing to leave. */
  escape: () => boolean
  fullscreen: () => void
  keep: () => void
  move: () => void
  step: (delta: 1 | -1) => void
  trash: () => void
  undo: () => void
  zoom: () => void
}

/**
 * Keys of the per-day sorting (W-Trideni): K koš, N nechat, S ★, C porovnat,
 * Z zpět, M přesunout, + zoom, F bez rušení, Esc, arrows. Only an extra:
 * every action has its own button.
 */
export function useSortScreenKeys(handlers: SortScreenKeys): void {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (ignoredKey(event)) return
      const now = latest.current
      if (now.blocked) return
      const run = (fn: () => void, repeatable = false) => {
        event.preventDefault()
        if (event.repeat && !repeatable) return
        fn()
      }
      switch (event.key) {
        case 'k':
        case 'K':
        case 'Delete':
          run(now.trash)
          break
        case 'n':
        case 'N':
          run(now.keep)
          break
        case 's':
        case 'S':
          run(now.best)
          break
        case 'c':
        case 'C':
          run(now.compare)
          break
        case 'z':
        case 'Z':
          run(now.undo)
          break
        case 'm':
        case 'M':
          run(now.move)
          break
        case '+':
        case '=':
          run(now.zoom)
          break
        case 'f':
        case 'F':
          run(now.fullscreen)
          break
        case 'ArrowLeft':
          run(() => {
            now.step(-1)
          }, true)
          break
        case 'ArrowRight':
          run(() => {
            now.step(1)
          }, true)
          break
        case 'Escape':
          if (now.escape()) event.preventDefault()
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
