/** Without `scrollend`, treat the smooth scroll as finished after this long. */
export const SCROLL_SETTLE_FALLBACK_MS = 1200
/** How long after the scroll ends layout changes still re-align the target. */
export const ANCHOR_WINDOW_MS = 1000
const TOLERANCE_PX = 2
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown']

/** Where the target's top should sit, mirroring scrollIntoView's block. */
function desiredTop(el: Element, block: ScrollLogicalPosition): number {
  const rect = el.getBoundingClientRect()
  if (block === 'center') return (window.innerHeight - rect.height) / 2
  if (block === 'end') return window.innerHeight - rect.height
  // `scroll-mt-*` keeps the target clear of the sticky header.
  return Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0
}

/** Re-aligns the element when layout shifts moved it; true if it scrolled. */
export function realign(el: Element, block: ScrollLogicalPosition): boolean {
  const drift = el.getBoundingClientRect().top - desiredTop(el, block)
  if (Math.abs(drift) <= TOLERANCE_PX) return false
  el.scrollIntoView({ behavior: 'auto', block })
  return true
}

/**
 * Smooth-scrolls to an element, then keeps it anchored: once the scroll ends
 * (scrollend, or a fallback timeout) and for a short window after, every
 * layout change (lazy blocks growing above it) re-aligns it. Any user input
 * cancels the anchoring. Returns a cancel function.
 */
export function scrollAndAnchor(
  getElement: () => Element | null,
  block: ScrollLogicalPosition,
  onSettled: () => void,
): () => void {
  const first = getElement()
  first?.scrollIntoView({ behavior: 'smooth', block })
  let fallback = 0
  let windowTimer = 0
  let observer: ResizeObserver | null = null
  let done = false

  const stop = () => {
    if (done) return
    done = true
    window.clearTimeout(fallback)
    window.clearTimeout(windowTimer)
    window.removeEventListener('scrollend', settle)
    observer?.disconnect()
    for (const name of USER_INPUT_EVENTS) window.removeEventListener(name, stop)
  }
  function settle() {
    if (done) return
    window.removeEventListener('scrollend', settle)
    window.clearTimeout(fallback)
    onSettled()
    const align = () => {
      if (done) return
      const el = getElement()
      if (el !== null) realign(el, block)
    }
    align()
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(align)
      observer.observe(document.body)
    }
    windowTimer = window.setTimeout(stop, ANCHOR_WINDOW_MS)
  }
  window.addEventListener('scrollend', settle, { once: true })
  for (const name of USER_INPUT_EVENTS)
    window.addEventListener(name, stop, { passive: true })
  fallback = window.setTimeout(settle, SCROLL_SETTLE_FALLBACK_MS)
  return stop
}
