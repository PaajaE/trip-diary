import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { PublishingPage } from '@/features/journey-workspace/ui/PublishingPage'
import { ToastContext } from '@/shared/ui/toast-context'

const repo = vi.hoisted(() => ({
  getJourneyPublishing: vi.fn(),
  updateJourneyPublishing: vi.fn(),
}))
vi.mock('@/entities/journey/api/journey-publishing.repository', () => ({
  PUBLISH_DELAY_OPTIONS: [0, 7, 14, 30, 90, 180, 365],
  getJourneyPublishing: repo.getJourneyPublishing,
  updateJourneyPublishing: repo.updateJourneyPublishing,
}))

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={{ showToast: vi.fn() }}>
        {children}
      </ToastContext.Provider>
    </QueryClientProvider>
  )
}

describe('PublishingPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('cs')
    repo.getJourneyPublishing.mockResolvedValue({
      momentCounts: { published: 3, total: 10 },
      publishDelayDays: 0,
      visibility: 'public',
    })
    repo.updateJourneyPublishing.mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows what is published and saves a delay', async () => {
    render(<PublishingPage journeyId="j1" />, { wrapper })
    expect(
      await screen.findByText('V editaci 10, zveřejněno 3 zastávek.'),
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Zpoždění zveřejnění'), {
      target: { value: '14' },
    })
    await vi.waitFor(() => {
      expect(repo.updateJourneyPublishing).toHaveBeenCalledWith('j1', {
        publishDelayDays: 14,
      })
    })
  })

  it('switches visibility', async () => {
    render(<PublishingPage journeyId="j1" />, { wrapper })
    fireEvent.click(await screen.findByRole('radio', { name: /Soukromá/ }))
    await vi.waitFor(() => {
      expect(repo.updateJourneyPublishing).toHaveBeenCalledWith('j1', {
        visibility: 'private',
      })
    })
  })
})
