import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import { useWorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { med, uuid } from '@/features/journey-workspace/test-fixtures'
import { EditableMediaTile } from '@/features/journey-workspace/ui/EditableMediaTile'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

const repo = vi.hoisted(() => ({
  restoreMedia: vi.fn(),
  trashMedia: vi.fn(),
  setJourneyCover: vi.fn(),
  updateMediaMeta: vi.fn(),
  updateMoment: vi.fn(),
  updateSegment: vi.fn(),
}))
vi.mock('@/entities/media/api/media-library.repository', () => ({
  updateMediaMeta: repo.updateMediaMeta,
}))
vi.mock('@/entities/media/api/media-trash.repository', () => ({
  restoreMedia: repo.restoreMedia,
  trashMedia: repo.trashMedia,
}))
vi.mock('@/entities/moment/api/moment.repository', () => ({
  updateMoment: repo.updateMoment,
}))
vi.mock('@/entities/segment/api/segment.repository', () => ({
  updateSegment: repo.updateSegment,
}))
vi.mock('@/entities/journey/api/journey-cover.repository', () => ({
  setJourneyCover: repo.setJourneyCover,
}))

const onOpen = vi.fn()
const JOURNEY = uuid(999)
const item = med(20)

let toasts: ShowToastOptions[] = []
let client: QueryClient

function Tile({ current }: { current: typeof item }) {
  const edits = useWorkspaceEdits(JOURNEY)
  return (
    <EditableMediaTile
      baseUrl="https://m.test"
      edits={edits}
      item={current}
      onOpen={onOpen}
    />
  )
}
function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>
      <ToastContext.Provider
        value={{
          showToast: (o) => {
            toasts.push(o)
          },
        }}
      >
        {children}
      </ToastContext.Provider>
    </QueryClientProvider>
  )
}

describe('EditableMediaTile', () => {
  beforeEach(async () => {
    toasts = []
    client = new QueryClient()
    client.setQueryData(mediaQueryKeys.journey(JOURNEY), [item])
    vi.clearAllMocks()
    repo.updateMediaMeta.mockResolvedValue(item)
    repo.trashMedia.mockResolvedValue(1)
    repo.restoreMedia.mockResolvedValue(1)
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('opens the viewer with the item and the clicked button', () => {
    render(<Tile current={item} />, { wrapper })
    const opener = screen.getByRole('button', { name: 'Open photo or video' })
    fireEvent.click(opener)
    expect(onOpen).toHaveBeenCalledWith(item, opener)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stars straight from the hover toolbar without opening the viewer', async () => {
    render(<Tile current={item} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Star this photo' }))
    await waitFor(() => {
      expect(repo.updateMediaMeta).toHaveBeenCalledWith(item.id, {
        starred: true,
      })
    })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows a star indicator and a caption overlay only when present', () => {
    const { rerender } = render(<Tile current={item} />, { wrapper })
    expect(screen.queryByTestId('starred-indicator')).toBeNull()
    rerender(<Tile current={{ ...item, caption: 'Lake', starred: true }} />)
    expect(screen.getByTestId('starred-indicator')).toBeTruthy()
    expect(screen.getByText('Lake')).toBeTruthy()
  })

  it('moves to the trash from the hover toolbar, removes it at once and Undo restores it', async () => {
    render(<Tile current={item} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }))
    expect(repo.trashMedia).toHaveBeenCalledWith([item.id])
    // Optimistic: gone from the cache before the server answered.
    expect(client.getQueryData(mediaQueryKeys.journey(JOURNEY))).toEqual([])
    expect(onOpen).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(toasts[0]?.action?.label).toBe('Undo')
    })
    toasts[0]?.action?.onClick()
    expect(client.getQueryData(mediaQueryKeys.journey(JOURNEY))).toEqual([item])
    await waitFor(() => {
      expect(repo.restoreMedia).toHaveBeenCalledWith([item.id])
    })
  })

  it('puts the item back and reports when trashing fails', async () => {
    repo.trashMedia.mockRejectedValue(new Error('boom'))
    render(<Tile current={item} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }))
    await waitFor(() => {
      expect(toasts[0]?.variant).toBe('error')
    })
    expect(client.getQueryData(mediaQueryKeys.journey(JOURNEY))).toEqual([item])
  })
})
