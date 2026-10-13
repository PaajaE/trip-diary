import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaLibraryDiagnosticsPage } from '@/pages/dev/MediaLibraryDiagnosticsPage'

const readMetadata = vi.fn()
const listAssets = vi.fn()

vi.mock('@/shared/lib/media-library', () => ({
  getMediaLibraryStatus: () => Promise.resolve('authorized'),
  isMediaLibraryAvailable: () => true,
  listMediaLibraryAssets: () => listAssets() as Promise<unknown>,
  readMediaLibraryEmbeddedMetadata: (id: string, options: unknown) =>
    readMetadata(id, options) as Promise<unknown>,
  requestMediaLibraryAccess: () => Promise.resolve('authorized'),
}))

function asset(id: string, isFavorite = true) {
  return {
    creationDate: '2026-01-01T10:00:00.000Z',
    height: 3000,
    id,
    isFavorite,
    mediaType: 'image',
    subtypes: [],
    width: 4000,
  }
}

function summaryJson(): Record<string, unknown> {
  const text = screen.getByTestId('media-library-summary').textContent
  return JSON.parse(text) as Record<string, unknown>
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  listAssets.mockResolvedValue({
    assets: [asset('a'), asset('b'), asset('c')],
    elapsedMs: 5,
  })
  readMetadata.mockResolvedValue({})
})

describe('MediaLibraryDiagnosticsPage iCloud download', () => {
  it('does not download from iCloud by default (allowNetwork: false)', async () => {
    render(<MediaLibraryDiagnosticsPage />)
    expect(screen.getByRole('checkbox', { name: /iCloud/ })).not.toBeChecked()
    await userEvent.click(
      screen.getByRole('button', { name: 'Spustit diagnostiku' }),
    )
    await waitFor(() => {
      expect(screen.getByTestId('media-library-summary')).toBeInTheDocument()
    })
    expect(readMetadata).toHaveBeenCalledTimes(3)
    for (const call of readMetadata.mock.calls) {
      expect(call[1]).toEqual({ allowNetwork: false })
    }
    expect(summaryJson()).toMatchObject({
      icloudDownload: false,
      metadataErrors: 0,
    })
  })

  it('passes allowNetwork: true only when the toggle is switched on', async () => {
    render(<MediaLibraryDiagnosticsPage />)
    await userEvent.click(screen.getByRole('checkbox', { name: /iCloud/ }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Spustit diagnostiku' }),
    )
    await waitFor(() => {
      expect(screen.getByTestId('media-library-summary')).toBeInTheDocument()
    })
    for (const call of readMetadata.mock.calls) {
      expect(call[1]).toEqual({ allowNetwork: true })
    }
    expect(summaryJson()).toMatchObject({ icloudDownload: true })
  })

  it('shows a slower-operation hint while downloading from iCloud', async () => {
    const releases: (() => void)[] = []
    readMetadata.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => {
            resolve({})
          })
        }),
    )
    render(<MediaLibraryDiagnosticsPage />)
    await userEvent.click(screen.getByRole('checkbox', { name: /iCloud/ }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Spustit diagnostiku' }),
    )
    expect(
      await screen.findByTestId('media-library-progress'),
    ).toHaveTextContent(/může trvat déle/)
    await waitFor(() => {
      expect(releases).toHaveLength(3)
    })
    releases.forEach((release) => {
      release()
    })
    await waitFor(() => {
      expect(
        screen.queryByTestId('media-library-progress'),
      ).not.toBeInTheDocument()
    })
  })

  it('counts a failed iCloud read without aborting the run', async () => {
    readMetadata.mockImplementation((id: string) =>
      id === 'b'
        ? Promise.reject(new Error('iCloud download failed'))
        : Promise.resolve({}),
    )
    render(<MediaLibraryDiagnosticsPage />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Spustit diagnostiku' }),
    )
    await waitFor(() => {
      expect(screen.getByTestId('media-library-summary')).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(summaryJson()).toMatchObject({
      assets: 3,
      metadataErrorSamples: ['iCloud download failed'],
      metadataErrors: 1,
    })
  })
})

describe('MediaLibraryDiagnosticsPage sampling', () => {
  it('reads metadata only for favorites, capped at the sample size', async () => {
    listAssets.mockResolvedValue({
      assets: [
        ...Array.from({ length: 80 }, (_, i) => asset(`fav${String(i)}`)),
        ...Array.from({ length: 20 }, (_, i) =>
          asset(`plain${String(i)}`, false),
        ),
      ],
      elapsedMs: 1,
    })
    render(<MediaLibraryDiagnosticsPage />)
    expect(screen.getByRole('checkbox', { name: /oblíbené/ })).toBeChecked()
    await userEvent.click(
      screen.getByRole('button', { name: 'Spustit diagnostiku' }),
    )
    await waitFor(() => {
      expect(screen.getByTestId('media-library-summary')).toBeInTheDocument()
    })
    expect(readMetadata).toHaveBeenCalledTimes(50)
    const ids = readMetadata.mock.calls.map((call) => String(call[0]))
    expect(ids.every((id) => id.startsWith('fav'))).toBe(true)
    expect(summaryJson()).toMatchObject({ favoritesOnly: true, sampled: 50 })
  })
})
