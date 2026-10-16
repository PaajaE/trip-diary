import '@/app/i18n'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicMapSection } from '@/features/public-journey/ui/LazyPublicJourneyMap'

vi.mock('@/features/public-journey/ui/PublicJourneyMap', () => ({
  default: (props: { className?: string; onReady?: () => void }) => (
    <button
      className={props.className}
      data-testid="map"
      onClick={props.onReady}
      type="button"
    />
  ),
}))

const preview = {
  dashed: true,
  lines: [
    [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
    ],
  ],
  points: [
    { x: 100, y: 100 },
    { x: 200, y: 150 },
  ],
}
const props = { label: 'Map', lines: [], points: [] }

afterEach(cleanup)

describe('PublicMapSection', () => {
  it('draws the preview, then fades the map in once it reports ready', async () => {
    const { container } = render(
      <PublicMapSection {...props} preview={preview} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
    const map = await screen.findByTestId('map')
    // The map sits in an absolutely positioned layer, transparent until ready.
    const layer = map.parentElement
    expect(layer?.className).toContain('opacity-0')
    map.click()
    await waitFor(() => {
      expect(layer?.className).toContain('opacity-100')
    })
  })

  it('falls back to the pulsing skeleton box without a preview', () => {
    const { container } = render(<PublicMapSection {...props} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })
})
