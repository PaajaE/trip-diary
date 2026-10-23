import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { publicJourneyFixture } from '@/entities/public-journey/lib/public-journey.fixture'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'

const [photo] = publicJourneyFixture.media
if (photo === undefined) throw new Error('fixture media')

describe('PublicMediaView', () => {
  afterEach(cleanup)

  it('fades a lazy image in once it has loaded', () => {
    render(<PublicMediaView media={photo} sizes="100vw" />)
    const img = screen.getByRole('img')
    expect(img).toHaveClass('opacity-0')
    fireEvent.load(img)
    expect(img).not.toHaveClass('opacity-0')
    expect(img).toHaveClass('motion-reduce:transition-none')
  })

  it('shows the priority (hero) image at once', () => {
    render(<PublicMediaView media={photo} priority sizes="100vw" />)
    expect(screen.getByRole('img')).not.toHaveClass('opacity-0')
  })

  it('does not leave a broken image invisible', () => {
    render(<PublicMediaView media={photo} sizes="100vw" />)
    const img = screen.getByRole('img')
    fireEvent.error(img)
    expect(img).not.toHaveClass('opacity-0')
  })
})
