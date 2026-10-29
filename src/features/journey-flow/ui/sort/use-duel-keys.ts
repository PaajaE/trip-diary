import { useEffect, useRef, type RefObject } from 'react'
import type { DuelRole } from '@/features/journey-flow/ui/sort/DuelPane'
import { FIT_VIEW } from '@/features/media-batch/model/zoom'
import { ignoredKey } from '@/features/media-batch/ui/sort-keys'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'

export interface DuelKeys {
  compare: PhotoCompareApi
  fullscreen: boolean
  /** The photo under the mouse; N and K act on it (else the challenger). */
  hovered: DuelRole | null
  keep: (role: DuelRole) => void
  onClose: () => void
  onUndo: () => void
  setFullscreen: (update: (value: boolean) => boolean) => void
  star: (role: DuelRole) => void
  step: (delta: 1 | -1) => void
  trash: (role: DuelRole) => void
}

/**
 * Keys of Porovnání (W-Serie): N nechat tuhle, K koš, S ★ (under the
 * mouse), [ ] challenger, Tab swaps the sides, + zoom, F full screen,
 * Z undo, Esc leaves zoom, then full screen, then the view.
 */
export function useDuelKeys(keys: DuelKeys): void {
  const latest = useRef(keys)
  useEffect(() => {
    latest.current = keys
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (ignoredKey(event)) return
      const now = latest.current
      const under = now.hovered ?? 'challenger'
      const run = (fn: () => void) => {
        event.preventDefault()
        if (!event.repeat) fn()
      }
      switch (event.key) {
        case '[':
        case ']':
          run(() => {
            now.step(event.key === ']' ? 1 : -1)
          })
          return
        case '+':
        case '=':
          run(now.compare.cycle)
          return
        case 'n':
        case 'N':
          run(() => {
            now.keep(under)
          })
          return
        case 'k':
        case 'K':
          run(() => {
            now.trash(under)
          })
          return
        case 's':
        case 'S':
          run(() => {
            now.star(now.hovered ?? 'winner')
          })
          return
        case 'z':
        case 'Z':
          run(now.onUndo)
          return
        case 'f':
        case 'F':
          run(() => {
            now.setFullscreen((value) => !value)
          })
          return
        case 'Tab':
          if (now.compare.handleKey(event)) event.preventDefault()
          return
        case 'Escape':
          event.preventDefault()
          if (now.compare.zoomed) now.compare.setZoom(() => FIT_VIEW)
          else if (now.fullscreen) now.setFullscreen(() => false)
          else now.onClose()
          return
        default:
          return
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}

/** Focus moves into a layer when it opens and back to the opener on close. */
export function useLayerFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const opener = document.activeElement
    ref.current?.focus({ preventScroll: true })
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [ref])
}
