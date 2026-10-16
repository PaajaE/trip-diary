import { cleanup, render, screen } from '@testing-library/react'
import { Lightbulb } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyState } from '@/shared/ui/EmptyState'

describe('EmptyState', () => {
  afterEach(cleanup)

  it('shows icon, title, text and the primary action', () => {
    render(
      <EmptyState
        action={<button type="button">Add</button>}
        description="Nothing yet."
        icon={Lightbulb}
        title="Empty"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Empty' })).toBeTruthy()
    expect(screen.getByText('Nothing yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
    expect(document.querySelector('svg')).not.toBeNull()
  })

  it('works without icon and action', () => {
    render(<EmptyState description="Text" title="Title" />)
    expect(document.querySelector('svg')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
