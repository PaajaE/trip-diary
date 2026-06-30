import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { getJourneyEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'

vi.mock('@/entities/photo/api/photo-gallery.repository', () => ({
  getJourneyEntryPhotoPreviews: vi.fn(),
  getPhotoDetailPreview: vi.fn().mockResolvedValue(null),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
  }: {
    children: React.ReactNode
    params: { entryId: string }
  }) => <a href={`/e/${params.entryId}`}>{children}</a>,
}))

function renderGallery(
  moments = [
    { entry: { id: crypto.randomUUID(), title: 'První moment' } },
    { entry: { id: crypto.randomUUID(), title: 'Druhý moment' } },
  ],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return {
    moments,
    ...render(
      <QueryClientProvider client={queryClient}>
        <JourneyGallery
          locatedPhotoIds={new Set()}
          moments={moments}
          onShowOnMap={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  }
}

describe('JourneyGallery', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows clear loading, error, and empty states', async () => {
    let rejectLoads: (reason: Error) => void = () => undefined
    vi.mocked(getJourneyEntryPhotoPreviews).mockReturnValue(
      new Promise((_, reject) => {
        rejectLoads = reject
      }),
    )
    const loadingView = renderGallery()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Načítám galerii cesty',
    )

    rejectLoads(new Error('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Galerii cesty se nepodařilo načíst',
    )
    loadingView.unmount()

    vi.mocked(getJourneyEntryPhotoPreviews).mockResolvedValue({
      failedEntryIds: new Set(),
      previewsByEntry: new Map(),
    })
    renderGallery()
    expect(
      await screen.findByText(
        'Fotky se tu objeví společně s prvními momenty cesty.',
      ),
    ).toBeVisible()
  })

  it('renders photos from all moments in one grid and opens the lightbox', async () => {
    const firstEntryId = crypto.randomUUID()
    const secondEntryId = crypto.randomUUID()
    vi.stubGlobal('URL', {
      createObjectURL: vi
        .fn()
        .mockImplementation(() => `blob:${crypto.randomUUID()}`),
      revokeObjectURL: vi.fn(),
    })
    vi.mocked(getJourneyEntryPhotoPreviews).mockResolvedValue({
      failedEntryIds: new Set(),
      previewsByEntry: new Map([
        [
          firstEntryId,
          [{ blob: new Blob(['first']), id: crypto.randomUUID() }],
        ],
        [
          secondEntryId,
          [{ blob: new Blob(['second']), id: crypto.randomUUID() }],
        ],
      ]),
    })
    renderGallery([
      { entry: { id: firstEntryId, title: 'První moment' } },
      { entry: { id: secondEntryId, title: 'Druhý moment' } },
    ])

    const buttons = await screen.findAllByRole('button', { name: /moment/i })
    expect(buttons).toHaveLength(2)
    const firstButton = buttons[0]
    expect(firstButton).toBeDefined()
    if (firstButton === undefined) {
      throw new Error('Expected first moment button')
    }
    fireEvent.click(firstButton)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeVisible()
    })
  })

  it('keeps available photos when another moment fails and hides broken images', async () => {
    const firstEntryId = crypto.randomUUID()
    const secondEntryId = crypto.randomUUID()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:available'),
      revokeObjectURL: vi.fn(),
    })
    vi.mocked(getJourneyEntryPhotoPreviews).mockResolvedValue({
      failedEntryIds: new Set([secondEntryId]),
      previewsByEntry: new Map([
        [
          firstEntryId,
          [{ blob: new Blob(['available']), id: crypto.randomUUID() }],
        ],
        [secondEntryId, []],
      ]),
    })
    renderGallery([
      { entry: { id: firstEntryId, title: 'První moment' } },
      { entry: { id: secondEntryId, title: 'Druhý moment' } },
    ])

    const image = await screen.findByRole('button', { name: 'První moment' })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Některé fotografie se nepodařilo načíst',
    )
    const img = image.querySelector('img')
    expect(img).toBeInstanceOf(HTMLImageElement)
    if (img instanceof HTMLImageElement) {
      fireEvent.error(img)
    }
    expect(
      screen.queryByRole('button', { name: 'První moment' }),
    ).not.toBeInTheDocument()
  })
})
