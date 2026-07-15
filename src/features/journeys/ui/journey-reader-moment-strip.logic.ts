import type { KeyboardEvent } from 'react'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'

export function getMomentExcerpt(body: string, maxLength = 96): string {
  const normalized = body.trim().replace(/\s+/g, ' ')
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

export function handleStripKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  moments: JourneyMoment[],
  activeMomentId: string | null,
  onActivateMoment: (entryId: string) => void,
) {
  if (moments.length === 0) {
    return
  }

  const currentIndex =
    activeMomentId === null
      ? -1
      : moments.findIndex((moment) => moment.entry.id === activeMomentId)

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown': {
      event.preventDefault()
      const next = moments[Math.min(currentIndex + 1, moments.length - 1)]
      if (next !== undefined) {
        onActivateMoment(next.entry.id)
      }
      break
    }
    case 'ArrowLeft':
    case 'ArrowUp': {
      event.preventDefault()
      const previous = moments[Math.max(currentIndex - 1, 0)]
      if (previous !== undefined) {
        onActivateMoment(previous.entry.id)
      }
      break
    }
    case 'Home': {
      event.preventDefault()
      const first = moments[0]
      if (first !== undefined) {
        onActivateMoment(first.entry.id)
      }
      break
    }
    case 'End': {
      event.preventDefault()
      const last = moments[moments.length - 1]
      if (last !== undefined) {
        onActivateMoment(last.entry.id)
      }
      break
    }
    default:
      break
  }
}

function prefersReducedMotion() {
  if (typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function scrollMomentIntoView(
  entryId: string,
  cardRefs: Map<string, HTMLButtonElement>,
  listNode: HTMLDivElement | null,
) {
  const card = cardRefs.get(entryId)
  if (card === undefined) {
    return
  }

  if (typeof card.scrollIntoView === 'function') {
    card.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  if (listNode !== null && document.activeElement === listNode) {
    card.focus({ preventScroll: true })
  }
}
