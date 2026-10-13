import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { QuickNotePage } from '@/features/quick-note/ui/QuickNotePage'

const J = '11111111-1111-4111-8111-111111111111'
const saveQuickNote = vi.fn()
let canLocate = true

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('@/features/auth/session/use-session', () => ({
  useSession: () => ({ user: { id: 'u1' } }),
}))
vi.mock('@/features/quick-note/api/save-quick-note', () => ({
  saveQuickNote: (...args: unknown[]) => saveQuickNote(...args) as unknown,
}))
vi.mock('@/shared/lib/geolocation', () => ({
  isGeolocationAvailable: () => canLocate,
}))

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuickNotePage journeyId={J} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  saveQuickNote.mockReset()
  canLocate = true
})

const textareaValue = () => {
  const node = screen.getByLabelText('Co se právě děje?')
  return node instanceof HTMLTextAreaElement ? node.value : null
}

const type = (value: string) => {
  fireEvent.change(screen.getByLabelText('Co se právě děje?'), {
    target: { value },
  })
}

describe('QuickNotePage', () => {
  it('saves the text with location on by default, then clears it and the draft', async () => {
    saveQuickNote.mockResolvedValue({ located: true, ok: true })
    renderPage()
    type('Medvěd u cesty')
    expect(localStorage.getItem(`trip-diary.quick-note.${J}`)).toBe(
      'Medvěd u cesty',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Uložit zápis' }))
    await screen.findByText(/Zápis uložen i s polohou/)
    expect(saveQuickNote).toHaveBeenCalledWith({
      journeyId: J,
      text: 'Medvěd u cesty',
      useLocation: true,
      userId: 'u1',
    })
    expect(textareaValue()).toBe('')
    expect(localStorage.getItem(`trip-diary.quick-note.${J}`)).toBeNull()
  })

  it('keeps the text and says so when saving fails', async () => {
    saveQuickNote.mockResolvedValue({ ok: false, reason: 'save_failed' })
    renderPage()
    type('Důležité')
    fireEvent.click(screen.getByRole('button', { name: 'Uložit zápis' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Text zůstal zachován',
    )
    expect(textareaValue()).toBe('Důležité')
  })

  it('restores the draft and respects the location toggle', async () => {
    localStorage.setItem(`trip-diary.quick-note.${J}`, 'Rozepsáno')
    saveQuickNote.mockResolvedValue({ located: false, ok: true })
    renderPage()
    expect(textareaValue()).toBe('Rozepsáno')
    fireEvent.click(screen.getByLabelText('Přidat moji polohu'))
    fireEvent.click(screen.getByRole('button', { name: 'Uložit zápis' }))
    await waitFor(() => {
      expect(saveQuickNote).toHaveBeenCalledWith(
        expect.objectContaining({ useLocation: false }),
      )
    })
  })

  it('hides the location option when it is unavailable and explains an empty note', async () => {
    canLocate = false
    saveQuickNote.mockResolvedValue({ ok: false, reason: 'empty' })
    renderPage()
    expect(screen.queryByLabelText('Přidat moji polohu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Uložit zápis' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'alespoň pár slov',
    )
  })
})
