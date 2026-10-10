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
import type { CoverTarget } from '@/features/journey-workspace/model/cover-targets'
import { med, uuid } from '@/features/journey-workspace/test-fixtures'
import { EditableMediaTile } from '@/features/journey-workspace/ui/EditableMediaTile'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

const repo = vi.hoisted(() => ({
  setJourneyCover: vi.fn(),
  updateMediaMeta: vi.fn(),
  updateMoment: vi.fn(),
  updateSegment: vi.fn(),
}))
vi.mock('@/entities/media/api/media-library.repository', () => ({
  updateMediaMeta: repo.updateMediaMeta,
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

const JOURNEY = uuid(999)
const item = med(20)
const targets: CoverTarget[] = [
  { currentCoverId: null, level: 'moment', targetId: uuid(10) },
  { currentCoverId: item.id, level: 'stage', targetId: uuid(1) },
  { currentCoverId: null, level: 'journey', targetId: JOURNEY },
]

let toasts: ShowToastOptions[] = []
let client: QueryClient

function Tile({ current }: { current: typeof item }) {
  const edits = useWorkspaceEdits(JOURNEY)
  return (
    <EditableMediaTile
      baseUrl="https://m.test"
      edits={edits}
      item={current}
      targets={targets}
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
    repo.updateMoment.mockResolvedValue({})
    repo.setJourneyCover.mockResolvedValue(undefined)
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('stars optimistically, offers Undo that restores the old value', async () => {
    render(<Tile current={item} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Star' }))
    expect(repo.updateMediaMeta).toHaveBeenCalledWith(item.id, {
      starred: true,
    })
    const cached = client.getQueryData<(typeof item)[]>(
      mediaQueryKeys.journey(JOURNEY),
    )
    expect(cached?.[0]?.starred).toBe(true)
    await waitFor(() => {
      expect(toasts[0]?.message).toBe('Starred')
    })
    toasts[0]?.action?.onClick()
    await waitFor(() => {
      expect(repo.updateMediaMeta).toHaveBeenLastCalledWith(item.id, {
        starred: false,
      })
    })
  })

  it('rolls back the star and shows an error toast when saving fails', async () => {
    repo.updateMediaMeta.mockRejectedValue(new Error('rls'))
    render(<Tile current={item} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Star' }))
    await waitFor(() => {
      expect(toasts[0]).toMatchObject({ variant: 'error' })
    })
    const cached = client.getQueryData<(typeof item)[]>(
      mediaQueryKeys.journey(JOURNEY),
    )
    expect(cached?.[0]?.starred).toBe(false)
  })

  it('shows the cover badge and only offers levels that contain the media', () => {
    render(<Tile current={item} />, { wrapper })
    expect(screen.getByText('Cover: stage')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use as cover' }))
    expect(
      screen.getByRole('button', { name: 'Use as cover of: moment' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Use as cover of: journey' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Use as cover of: trip' }),
    ).toBeNull()
    const current = screen.getByRole('button', {
      name: 'Already the cover of: stage',
    })
    expect((current as HTMLButtonElement).disabled).toBe(true)
  })

  it('sets the moment cover and the journey cover through repositories', async () => {
    render(<Tile current={item} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Use as cover' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Use as cover of: moment' }),
    )
    await waitFor(() => {
      expect(repo.updateMoment).toHaveBeenCalledWith(uuid(10), {
        coverMediaId: item.id,
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Use as cover' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Use as cover of: journey' }),
    )
    await waitFor(() => {
      expect(repo.setJourneyCover).toHaveBeenCalledWith(JOURNEY, item.id)
    })
  })

  it('saves a trimmed caption on Enter, cancels on Escape', async () => {
    render(<Tile current={item} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /Add caption/ }))
    const input = screen.getByRole('textbox', { name: 'Caption' })
    fireEvent.change(input, { target: { value: '  Lake  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(repo.updateMediaMeta).toHaveBeenCalledWith(item.id, {
        caption: 'Lake',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: /Add caption|Lake/ }))
    const second = screen.getByRole('textbox', { name: 'Caption' })
    fireEvent.change(second, { target: { value: 'discarded' } })
    fireEvent.keyDown(second, { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(repo.updateMediaMeta).toHaveBeenCalledTimes(1)
  })

  it('rejects an over-long caption without calling the repository', async () => {
    render(<Tile current={item} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /Add caption/ }))
    const input = screen.getByRole('textbox', { name: 'Caption' })
    fireEvent.change(input, { target: { value: 'a'.repeat(2001) } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(repo.updateMediaMeta).not.toHaveBeenCalled()
  })
})
