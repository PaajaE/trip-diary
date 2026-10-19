import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANCHOR_WINDOW_MS,
  scrollAndAnchor,
} from '@/features/journey-workspace/lib/anchor-scroll'

let resize: () => void = () => undefined
class FakeResizeObserver {
  constructor(cb: () => void) {
    resize = cb
  }
  observe = vi.fn()
  disconnect = vi.fn()
}

function target(top: { value: number }) {
  const el = document.createElement('h3')
  const scroll = vi.fn()
  el.getBoundingClientRect = () => ({ height: 20, top: top.value }) as DOMRect
  el.scrollIntoView = scroll
  return { el, scroll }
}

describe('scrollAndAnchor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('re-aligns with an instant scroll when blocks above grew after the jump', () => {
    const top = { value: 0 }
    const { el, scroll } = target(top)
    const settled = vi.fn()
    scrollAndAnchor(() => el, 'start', settled)
    expect(scroll).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
    // The smooth scroll ends with the target pushed down by growing blocks.
    top.value = 640
    window.dispatchEvent(new Event('scrollend'))
    expect(settled).toHaveBeenCalledOnce()
    expect(scroll).toHaveBeenLastCalledWith({
      behavior: 'auto',
      block: 'start',
    })
    // Another block above renders inside the settle window.
    const calls = scroll.mock.calls.length
    top.value = 300
    resize()
    expect(scroll.mock.calls.length).toBe(calls + 1)
    // Aligned: no needless scroll.
    top.value = 1
    resize()
    expect(scroll.mock.calls.length).toBe(calls + 1)
  })

  it('falls back to a timeout when scrollend never comes, and stops after the window', () => {
    const top = { value: 500 }
    const { el, scroll } = target(top)
    scrollAndAnchor(() => el, 'start', vi.fn())
    vi.advanceTimersByTime(1200)
    expect(scroll).toHaveBeenLastCalledWith({
      behavior: 'auto',
      block: 'start',
    })
    vi.advanceTimersByTime(ANCHOR_WINDOW_MS + 10)
    const calls = scroll.mock.calls.length
    top.value = 700
    window.dispatchEvent(new Event('scrollend'))
    expect(scroll.mock.calls.length).toBe(calls)
  })

  it.each(['wheel', 'touchstart', 'keydown'])(
    'user %s cancels the anchoring',
    (name) => {
      const top = { value: 0 }
      const { el, scroll } = target(top)
      scrollAndAnchor(() => el, 'start', vi.fn())
      window.dispatchEvent(new Event('scrollend'))
      const calls = scroll.mock.calls.length
      window.dispatchEvent(new Event(name))
      top.value = 600
      resize()
      expect(scroll.mock.calls.length).toBe(calls)
    },
  )

  it('input during the smooth scroll prevents any later correction', () => {
    const top = { value: 600 }
    const { el, scroll } = target(top)
    scrollAndAnchor(() => el, 'start', vi.fn())
    window.dispatchEvent(new Event('wheel'))
    window.dispatchEvent(new Event('scrollend'))
    vi.advanceTimersByTime(2000)
    expect(scroll).toHaveBeenCalledTimes(1)
  })
})
