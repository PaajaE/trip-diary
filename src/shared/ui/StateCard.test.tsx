import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StateCard, type StateCardVariant } from '@/shared/ui/StateCard'

describe('StateCard', () => {
  afterEach(cleanup)

  it.each<[StateCardVariant, string | null]>([
    ['empty', null],
    ['offline', 'status'],
    ['error', 'alert'],
    ['success', 'status'],
  ])('renders the %s variant with icon, text and action', (variant, role) => {
    render(
      <StateCard
        action={<button type="button">Go</button>}
        description="Calm text."
        title="Title"
        variant={variant}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy()
    expect(screen.getByText('Calm text.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy()
    expect(document.querySelector('svg')).not.toBeNull()
    expect(document.querySelector(`[data-variant="${variant}"]`)).not.toBeNull()
    if (role !== null) expect(screen.getByRole(role)).toBeTruthy()
  })

  it('can hide the icon', () => {
    render(<StateCard description="d" icon={null} title="t" />)
    expect(document.querySelector('svg')).toBeNull()
  })
})
