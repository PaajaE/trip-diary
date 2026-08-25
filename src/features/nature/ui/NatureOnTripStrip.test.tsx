import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listJourneyChecklistItems } from '@/entities/checklist/api/checklist-mutation.repository'
import { listJourneyObservations } from '@/entities/nature/api/observation.repository'
import { NatureOnTripStrip } from '@/features/nature/ui/NatureOnTripStrip'
import '@/app/i18n'

vi.mock('@/entities/checklist/api/checklist-mutation.repository', () => ({
  applyChecklistTemplate: vi.fn(),
  listJourneyChecklistItems: vi.fn(),
  setJourneyChecklistItemChecked: vi.fn(),
}))
vi.mock('@/entities/nature/api/observation.repository', () => ({
  listJourneyObservations: vi.fn(),
}))
vi.mock('@/features/checklist/ui/ApplyChecklistTemplateSheet', () => ({
  ApplyChecklistTemplateSheet: () => null,
}))
vi.mock('@/features/nature/ui/NatureDetailSheet', () => ({
  NatureDetailSheet: () => null,
}))
vi.mock('@/features/nature/ui/JourneyNatureGuidePanel', () => ({
  JourneyNatureGuidePanel: () => null,
}))
vi.mock('@/features/nature/ui/NatureEmptyState', () => ({
  NatureEmptyState: () => null,
}))
vi.mock('@/features/nature/ui/NatureWishChip', () => ({
  NatureWishChip: () => null,
}))
vi.mock('@/features/nature/ui/NatureWishDetailSheet', () => ({
  NatureWishDetailSheet: () => null,
}))

function renderStrip(canEdit: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <NatureOnTripStrip
        canEdit={canEdit}
        creatorId="00000000-0000-4000-8000-000000000099"
        journeyId="00000000-0000-4000-8000-000000000001"
        onChanged={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('NatureOnTripStrip empty reader state', () => {
  afterEach(() => {
    cleanup()
  })

  it('hides add-tips copy from readers when there are no nature goals', async () => {
    vi.mocked(listJourneyChecklistItems).mockResolvedValue([])
    vi.mocked(listJourneyObservations).mockResolvedValue([])

    renderStrip(false)

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Příroda na cestě')).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Zatím žádné přírodní cíle. Přidej tipy na park a začni.',
      ),
    ).not.toBeInTheDocument()
  })

  it('keeps add-tips copy for editors of an empty journey', async () => {
    vi.mocked(listJourneyChecklistItems).mockResolvedValue([])
    vi.mocked(listJourneyObservations).mockResolvedValue([])

    renderStrip(true)

    expect(
      await screen.findByText(
        'Přidej tipy na park — zvířata, rostliny a geologii.',
      ),
    ).toBeInTheDocument()
  })
})
