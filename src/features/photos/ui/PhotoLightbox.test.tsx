import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { getPhotoDetailPreview } from '@/entities/photo/api/photo-gallery.repository'
import { PhotoLightbox } from '@/features/photos/ui/PhotoLightbox'

vi.mock('@/entities/photo/api/photo-gallery.repository', () => ({
  getPhotoDetailPreview: vi.fn(),
}))

describe('PhotoLightbox', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the selected photo and navigates between items', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:detail'),
      revokeObjectURL: vi.fn(),
    })
    vi.mocked(getPhotoDetailPreview).mockImplementation(async (photoId) =>
      photoId === 'photo-2'
        ? { blob: new Blob(['detail']), id: photoId }
        : null,
    )

    render(
      <PhotoLightbox
        initialIndex={1}
        onClose={vi.fn()}
        photos={[
          {
            alt: 'First',
            id: 'photo-1',
            thumbUrl: 'blob:first-thumb',
          },
          {
            alt: 'Second',
            id: 'photo-2',
            thumbUrl: 'blob:second-thumb',
          },
        ]}
      />,
    )

    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByText('2 / 2')).toBeVisible()
    expect(await screen.findByRole('img', { name: 'Second' })).toHaveAttribute(
      'src',
      'blob:detail',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Předchozí fotka' }))
    expect(screen.getByRole('img', { name: 'First' })).toHaveAttribute(
      'src',
      'blob:first-thumb',
    )
  })

  it('closes when the close button is pressed', () => {
    const onClose = vi.fn()
    render(
      <PhotoLightbox
        onClose={onClose}
        photos={[
          {
            alt: 'Only',
            id: 'photo-1',
            thumbUrl: 'blob:only',
          },
        ]}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Zavřít prohlížeč fotek' }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
