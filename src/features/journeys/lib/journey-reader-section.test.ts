import { describe, expect, it, vi } from 'vitest'
import { scrollToReaderSection } from '@/features/journeys/lib/journey-reader-section'

describe('scrollToReaderSection', () => {
  it('uses instant scrolling when reduced motion is preferred', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    })

    const element = document.createElement('section')
    element.id = 'reader-story'
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 240 }),
    })
    document.body.append(element)

    scrollToReaderSection('story')

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'auto',
      top: expect.any(Number),
    })

    element.remove()
  })
})
