import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { TrashedMediaItem } from '@/entities/media/model/media-library'
import { med, uuid } from '@/features/journey-workspace/test-fixtures'
import { trashDaysLeft } from '@/features/journey-workspace/lib/trash-retention'
import { TrashPage } from '@/features/journey-workspace/ui/TrashPage'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

const ME = uuid(1)
const OTHER = uuid(2)
const NOW = Date.parse('2026-02-10T12:00:00Z')

const repo = vi.hoisted(() => ({
  calls: [] as string[],
  claim: vi.fn(),
  deleteObjects: vi.fn(),
  listTrashedMedia: vi.fn(),
  purgeMediaRows: vi.fn(),
  restoreMedia: vi.fn(),
}))
const access = vi.hoisted(() => ({ canEdit: true }))
vi.mock('@/features/journey-workspace/api/use-can-edit-journey', () => ({
  useCanEditJourney: () => ({ canEdit: access.canEdit, ready: true }),
}))
vi.mock('@/entities/media/api/media-trash.repository', () => ({
  claimMediaPurge: repo.claim,
  listTrashedMedia: repo.listTrashedMedia,
  purgeMediaRows: repo.purgeMediaRows,
  restoreMedia: repo.restoreMedia,
}))
vi.mock('@/entities/media/api/media-upload.api', () => ({
  deleteMediaObjectsRemote: repo.deleteObjects,
}))
vi.mock('@/features/auth/session', () => ({
  useSession: () => ({ loading: false, user: { id: ME } }),
}))

function trashed(
  n: number,
  owner: string,
  deletedAt: string,
): TrashedMediaItem {
  return { ...med(n), deletedAt, ownerId: owner, purgeClaimedAt: null }
}

let toasts: ShowToastOptions[] = []
function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
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

const mineA = trashed(30, ME, '2026-02-09T12:00:00Z')
const mineB = trashed(31, ME, '2026-01-05T12:00:00Z')
const theirs = trashed(32, OTHER, '2026-02-01T12:00:00Z')

describe('trashDaysLeft', () => {
  it('counts whole days until 30 days after deletion, never below zero', () => {
    expect(trashDaysLeft('2026-02-09T12:00:00Z', NOW)).toBe(29)
    expect(trashDaysLeft('2026-02-09T00:00:00Z', NOW)).toBe(29)
    expect(trashDaysLeft('2026-01-01T00:00:00Z', NOW)).toBe(0)
  })
})

describe('TrashPage', () => {
  beforeEach(async () => {
    toasts = []
    repo.calls = []
    vi.clearAllMocks()
    repo.listTrashedMedia.mockResolvedValue([mineA, mineB, theirs])
    access.canEdit = true
    repo.claim.mockImplementation((ids: string[]) => {
      repo.calls.push(`claim:${ids.join(',')}`)
      return Promise.resolve(ids)
    })
    repo.restoreMedia.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.length),
    )
    repo.deleteObjects.mockImplementation((id: string) => {
      repo.calls.push(`r2:${id}`)
      return Promise.resolve(1)
    })
    repo.purgeMediaRows.mockImplementation((ids: string[]) => {
      repo.calls.push(`rows:${ids.join(',')}`)
      return Promise.resolve(ids)
    })
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  async function open() {
    render(<TrashPage journeyId="j" now={NOW} />, { wrapper })
    await screen.findAllByRole('checkbox')
  }
  const pick = (item: TrashedMediaItem) => {
    const box =
      screen.getAllByRole('checkbox')[[mineA, mineB, theirs].indexOf(item)]!
    fireEvent.click(box)
  }

  it('shows an empty state', async () => {
    repo.listTrashedMedia.mockResolvedValue([])
    render(<TrashPage journeyId="j" now={NOW} />, { wrapper })
    expect(await screen.findByText('The trash is empty')).toBeTruthy()
  })

  it('shows the countdown for every item', async () => {
    await open()
    const left = screen
      .getAllByTestId('trash-days-left')
      .map((n) => n.textContent)
    expect(left).toEqual([
      '29 days left',
      'waiting for cleanup',
      '21 days left',
    ])
  })

  it('restores the selection', async () => {
    await open()
    pick(mineA)
    pick(theirs)
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => {
      expect(repo.restoreMedia).toHaveBeenCalledWith([mineA.id, theirs.id])
    })
  })

  it('purges only after confirmation: R2 objects first, then the rows', async () => {
    await open()
    pick(mineA)
    pick(mineB)
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(repo.deleteObjects).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Delete permanently' })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete permanently' }),
    )
    await waitFor(() => {
      expect(repo.purgeMediaRows).toHaveBeenCalled()
    })
    expect(repo.calls).toEqual([
      `claim:${mineA.id},${mineB.id}`,
      `r2:${mineA.id}`,
      `r2:${mineB.id}`,
      `rows:${mineA.id},${mineB.id}`,
    ])
  })

  it('keeps an item in the trash when its R2 delete fails and reports it', async () => {
    repo.deleteObjects.mockImplementation((id: string) =>
      id === mineB.id ? Promise.reject(new Error('r2')) : Promise.resolve(1),
    )
    await open()
    pick(mineA)
    pick(mineB)
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete permanently',
      }),
    )
    await waitFor(() => {
      expect(toasts.some((t) => t.variant === 'error')).toBe(true)
    })
    expect(repo.purgeMediaRows).toHaveBeenCalledWith([mineA.id])
    expect(toasts.map((t) => t.message)).toContain(
      'Could not delete 1 item, it stays in the trash.',
    )
  })

  it('cannot purge items uploaded by someone else, only restore them', async () => {
    await open()
    pick(theirs)
    expect(
      screen.getByRole('button', { name: 'Delete permanently' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled()
    expect(screen.getByTestId('purge-note').textContent).toContain(
      'Only the person who uploaded',
    )
  })

  it('empties the trash for the own items only, after confirmation', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Permanently delete 2 items')
    expect(dialog.textContent).toContain('1 item uploaded by someone else')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete permanently' }),
    )
    await waitFor(() => {
      expect(repo.purgeMediaRows).toHaveBeenCalledWith([mineA.id, mineB.id])
    })
  })

  it('skips ids the claim did not return and never deletes their files', async () => {
    repo.claim.mockResolvedValue([mineA.id])
    await open()
    pick(mineA)
    pick(mineB)
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete permanently',
      }),
    )
    await waitFor(() => {
      expect(repo.purgeMediaRows).toHaveBeenCalledWith([mineA.id])
    })
    expect(repo.deleteObjects).toHaveBeenCalledTimes(1)
    expect(repo.deleteObjects).toHaveBeenCalledWith(mineA.id)
    expect(toasts.map((t) => t.message)).toContain(
      'Skipped while deleting: 1 (they changed meanwhile).',
    )
  })

  it('shows claimed items as waiting for deletion and cannot restore them', async () => {
    const claimedItem = { ...mineA, purgeClaimedAt: '2026-02-10T10:00:00Z' }
    repo.listTrashedMedia.mockResolvedValue([claimedItem, mineB])
    await open()
    expect(screen.getByText('waiting for deletion')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled()
    // Purging a claimed item (retry after an R2 failure) stays possible.
    expect(
      screen.getByRole('button', { name: 'Delete permanently' }),
    ).toBeEnabled()
  })

  it('reports a partial restore honestly', async () => {
    repo.restoreMedia.mockResolvedValue(1)
    await open()
    pick(mineA)
    pick(mineB)
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => {
      expect(toasts.map((t) => t.message)).toContain('Restored 1 of 2')
    })
  })

  it('disables every action with an explanation for read-only members', async () => {
    access.canEdit = false
    await open()
    pick(mineA)
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Delete permanently' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Empty trash' })).toBeDisabled()
    expect(screen.getByTestId('read-only-note')).toBeTruthy()
  })
})
