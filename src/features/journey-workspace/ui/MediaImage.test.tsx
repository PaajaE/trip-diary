import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { med, variant } from '@/features/journey-workspace/test-fixtures'
import { MediaImage } from '@/features/journey-workspace/ui/MediaImage'

const BASE = 'https://cdn.test'

function photo() {
  const id = med(1).id
  return med(1, {
    variants: [
      { ...variant(id, 'thumb', 'k/t.webp'), width: 205 },
      { ...variant(id, 'small', 'k/s.webp'), width: 747 },
      { ...variant(id, 'medium', 'k/m.webp'), width: 1494 },
    ],
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MediaImage', () => {
  it('offers every variant by width and sizes = the measured width', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 312,
    } as DOMRect)
    const { container } = render(<MediaImage baseUrl={BASE} item={photo()} />)
    const img = container.querySelector('img')
    if (img === null) throw new Error('no img')
    expect(img.getAttribute('sizes')).toBe('312px')
    expect(img.getAttribute('srcset')).toBe(
      `${BASE}/k/t.webp 205w, ${BASE}/k/s.webp 747w, ${BASE}/k/m.webp 1494w`,
    )
    expect(img.getAttribute('src')).toBe(`${BASE}/k/s.webp`)
  })

  it('falls back to the plain thumb without a layout', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 0,
    } as DOMRect)
    const { container } = render(<MediaImage baseUrl={BASE} item={photo()} />)
    const img = container.querySelector('img')
    if (img === null) throw new Error('no img')
    expect(img.getAttribute('src')).toBe(`${BASE}/k/t.webp`)
    expect(img.getAttribute('srcset')).toBeNull()
  })

  it('renders nothing for media without an image variant', () => {
    const { container } = render(
      <MediaImage baseUrl={BASE} item={med(2, { variants: [] })} />,
    )
    expect(container.querySelector('img')).toBeNull()
  })
})
