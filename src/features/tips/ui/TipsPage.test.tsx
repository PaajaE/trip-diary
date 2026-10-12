import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import type { Tip } from '@/entities/tip/model/tip'
import { TipsPage } from '@/features/tips/ui/TipsPage'

const U = '22222222-2222-4222-8222-222222222222'
const S = '33333333-3333-4333-8333-333333333333'
const tip: Tip = {
  authorId: U,
  body: 'Řádek 1\nŘádek 2',
  createdAt: '2026-01-01T10:00:00+00:00',
  id: '11111111-1111-4111-8111-111111111111',
  journeyId: null,
  publishedAt: null,
  slug: 's',
  spaceId: S,
  title: 'Dobré jídlo',
  updatedAt: '2026-01-02T10:00:00+00:00',
  visibility: 'private',
}

const actions = {
  create: vi.fn(() => Promise.resolve(true)),
  remove: vi.fn(() => Promise.resolve(true)),
  update: vi.fn(() => Promise.resolve(true)),
}
let space: { id: string } | null = { id: S }
let tips: {
  data?: Tip[] | undefined
  isError: boolean
  isPending: boolean
  refetch: () => void
} = {
  data: [tip],
  isError: false,
  isPending: false,
  refetch: vi.fn(),
}
vi.mock('@/features/auth/session/use-session', () => ({
  useSession: () => ({ user: { id: U } }),
}))
vi.mock('@/features/spaces', () => ({
  useActiveSpace: () => ({
    activeSpace: space,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/entities/tip/api/use-tips-query', () => ({
  useTipsQuery: () => tips,
}))
vi.mock('@/features/tips/api/use-tip-actions', () => ({
  useTipActions: () => actions,
}))

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TipsPage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  space = { id: S }
  tips = { data: [tip], isError: false, isPending: false, refetch: vi.fn() }
})

describe('TipsPage', () => {
  it('lists tips with visibility', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Dobré jídlo' })).toBeTruthy()
    expect(screen.getByText('Soukromý')).toBeTruthy()
  })

  it('shows the empty state with a create action', () => {
    tips = { ...tips, data: [] }
    renderPage()
    expect(screen.getByText('Zatím žádné tipy')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nový tip' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('explains when there is no space to write in', () => {
    space = null
    renderPage()
    expect(screen.getByText('Není kam psát')).toBeTruthy()
  })

  it('shows an error with retry', () => {
    tips = { ...tips, data: undefined, isError: true }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }))
    expect(tips.refetch).toHaveBeenCalled()
  })

  it('creates a tip, publishing when ticked', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Nový tip' }))
    fireEvent.change(screen.getByLabelText('Název'), {
      target: { value: '  Kemp  ' },
    })
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'U jezera' },
    })
    fireEvent.click(screen.getByLabelText('Zveřejnit'))
    fireEvent.click(screen.getByRole('button', { name: 'Uložit' }))
    await waitFor(() => {
      expect(actions.create).toHaveBeenCalledWith({
        body: 'U jezera',
        title: 'Kemp',
        visibility: 'public',
      })
    })
  })

  it('validates the title and does not save', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Nový tip' }))
    fireEvent.click(screen.getByRole('button', { name: 'Uložit' }))
    expect(screen.getByRole('alert').textContent).toContain('povinný')
    expect(actions.create).not.toHaveBeenCalled()
  })

  it('edits an existing tip and asks before discarding changes', async () => {
    renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: 'Upravit tip: Dobré jídlo' }),
    )
    fireEvent.change(screen.getByLabelText('Název'), {
      target: { value: 'Nový název' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }))
    expect(screen.getByText('Máte neuložené změny. Zahodit je?')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Pokračovat v úpravách' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Uložit' }))
    await waitFor(() => {
      expect(actions.update).toHaveBeenCalledWith(
        tip,
        expect.objectContaining({ title: 'Nový název' }),
      )
    })
  })

  it('deletes only after confirmation', async () => {
    renderPage()
    fireEvent.click(
      screen.getByRole('button', { name: 'Smazat tip: Dobré jídlo' }),
    )
    expect(actions.remove).not.toHaveBeenCalled()
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Smazat',
      }),
    )
    await waitFor(() => {
      expect(actions.remove).toHaveBeenCalledWith(tip)
    })
  })
})
