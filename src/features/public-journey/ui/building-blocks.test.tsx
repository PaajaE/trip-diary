import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicJourneyFixture } from '@/entities/public-journey/lib/public-journey.fixture'
import { DayMosaic } from '@/features/public-journey/ui/DayMosaic'
import { StageBadge } from '@/features/public-journey/ui/StageBadge'
import { StageStrip } from '@/features/public-journey/ui/StageStrip'
import { StatRow } from '@/features/public-journey/ui/StatRow'

const photos = publicJourneyFixture.media

afterEach(cleanup)

describe('StatRow', () => {
  it('renders value and label pairs', () => {
    render(
      <StatRow
        stats={[
          { label: 'dní', value: '19' },
          { label: 'etap', value: '5' },
        ]}
      />,
    )
    expect(screen.getByText('19').nextSibling).toBeNull()
    expect(screen.getByText('dní')).toBeInTheDocument()
  })

  it('renders nothing without stats', () => {
    const { container } = render(<StatRow stats={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('StageStrip', () => {
  it('sizes segments by weight and fades the non-current ones', () => {
    render(
      <StageStrip
        currentId="b"
        items={[
          { color: '#111111', id: 'a', label: 'A', weight: 3 },
          { color: '#222222', id: 'b', label: 'B', weight: 1 },
        ]}
      />,
    )
    const [a, b] = screen.getAllByRole('listitem')
    expect(a).toHaveStyle({ flexGrow: '3' })
    expect(a).toHaveClass('opacity-35')
    expect(b).not.toHaveClass('opacity-35')
  })
})

describe('StageBadge', () => {
  it('shows the label in the stage colour', () => {
    render(<StageBadge color="#b85f42" label="Etapa 2" />)
    expect(screen.getByText('Etapa 2')).toHaveStyle({
      backgroundColor: '#b85f42',
    })
  })
})

describe('DayMosaic', () => {
  it('shows at most three tiles and a +N badge for the rest', () => {
    render(<DayMosaic media={photos} sizes="100vw" total={17} />)
    expect(screen.getAllByRole('img')).toHaveLength(photos.length)
    expect(screen.getByText('+15')).toBeInTheDocument()
  })

  it('opens the lightbox at the tapped photo', async () => {
    const onOpen = vi.fn()
    render(<DayMosaic media={photos} sizes="100vw" onOpen={onOpen} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(photos.length)
    await userEvent.click(buttons[1] ?? document.body)
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it('shows a placeholder without photos', () => {
    render(<DayMosaic media={[]} sizes="100vw" />)
    expect(screen.getByTestId('public-day-mosaic')).toBeInTheDocument()
  })
})
