import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { getEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'

vi.mock('@/entities/photo/api/photo-gallery.repository', () => ({
  getEntryPhotoPreviews: vi.fn(),
  getPhotoDetailPreview: vi.fn().mockResolvedValue(null),
}))

function renderGallery() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PhotoGallery alt="Výlet" entryId={crypto.randomUUID()} />
    </QueryClientProvider>,
  )
}

describe('PhotoGallery', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('distinguishes loading, error, and empty states', async () => {
    let rejectLoad: (reason: Error) => void = () => undefined
    vi.mocked(getEntryPhotoPreviews).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectLoad = reject
      }),
    )
    const loadingView = renderGallery()
    expect(screen.getByRole('status')).toHaveTextContent('Načítám fotografie')

    rejectLoad(new Error('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fotografie se nepodařilo načíst',
    )
    loadingView.unmount()

    vi.mocked(getEntryPhotoPreviews).mockResolvedValueOnce([])
    renderGallery()
    expect(await screen.findByText('Zatím žádné fotografie.')).toBeVisible()
  })

  it('opens the lightbox when a thumbnail is clicked', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:thumb'),
      revokeObjectURL: vi.fn(),
    })
    vi.mocked(getEntryPhotoPreviews).mockResolvedValueOnce([
      { blob: new Blob(['thumb']), id: crypto.randomUUID() },
    ])
    renderGallery()

    fireEvent.click(await screen.findByRole('button', { name: 'Výlet' }))
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByText('1 / 1')).toBeVisible()
  })

  it('hides only a broken image and keeps the rest of the gallery', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi
        .fn()
        .mockReturnValueOnce('blob:broken')
        .mockReturnValueOnce('blob:usable'),
      revokeObjectURL: vi.fn(),
    })
    vi.mocked(getEntryPhotoPreviews).mockResolvedValueOnce([
      { blob: new Blob(['broken']), id: crypto.randomUUID() },
      { blob: new Blob(['usable']), id: crypto.randomUUID() },
    ])
    renderGallery()

    const buttons = await screen.findAllByRole('button', { name: 'Výlet' })
    const brokenButton = buttons[0]
    expect(brokenButton).toBeDefined()
    if (brokenButton !== undefined) {
      const img = brokenButton.querySelector('img')
      expect(img).toBeInstanceOf(HTMLImageElement)
      if (img instanceof HTMLImageElement) {
        fireEvent.error(img)
      }
    }

    expect(screen.getAllByRole('button', { name: 'Výlet' })).toHaveLength(1)
  })
})
