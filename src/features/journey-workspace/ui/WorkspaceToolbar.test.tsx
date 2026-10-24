import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { WorkspaceToolbar } from '@/features/journey-workspace/ui/WorkspaceToolbar'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/somewhere">{children}</a>
  ),
}))
vi.mock('@/features/journey-organize/ui/OrganizeJourneyButton', () => ({
  OrganizeDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button type="button" onClick={onClose}>
        Close dialog
      </button>
    </div>
  ),
}))

describe('WorkspaceToolbar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('opens the organize dialog from a direct secondary button', () => {
    render(<WorkspaceToolbar journeyId="j" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const button = screen.getByRole('button', {
      name: 'Organize automatically',
    })
    expect(button.getAttribute('title')).toMatch(/suggests stops/i)
    fireEvent.click(button)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('no longer hides the action in a "..." menu', () => {
    render(<WorkspaceToolbar journeyId="j" />)
    expect(screen.queryByRole('button', { name: /more actions/i })).toBeNull()
  })
})
