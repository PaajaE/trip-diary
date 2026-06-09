import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '@/app/App'
import '@/app/i18n'

describe('HomePage', () => {
  it('offers the primary capture action', async () => {
    render(<App />)

    expect(
      await screen.findByRole('button', { name: 'Přidat vzpomínku' }),
    ).toBeVisible()
  })
})
