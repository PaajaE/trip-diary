import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateEntryContent } from '@/entities/entry/api/entry-mutation.repository'
import type { Entry } from '@/entities/entry/model/entry'
import { InlineMomentEditor } from '@/features/journeys/ui/InlineMomentEditor'
import '@/app/i18n'

vi.mock('@/entities/entry/api/entry-mutation.repository', () => ({
  updateEntryContent: vi.fn(),
}))

vi.mock('@/shared/sync/auto-sync', () => ({
  canAutomaticallySync: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/shared/sync/sync.service', () => ({
  syncPendingOperations: vi.fn().mockResolvedValue(undefined),
}))

const creatorId = crypto.randomUUID()
const entryId = crypto.randomUUID()

function buildUpdatedEntry(body: string, title: string): Entry {
  const now = new Date().toISOString()
  return {
    body,
    createdAt: now,
    creatorId,
    eventAt: now,
    id: entryId,
    language: 'cs',
    publishedAt: now,
    slug: 'moment',
    spaceId: crypto.randomUUID(),
    status: 'published',
    syncStatus: 'synced',
    title,
    type: 'story',
    updatedAt: now,
    version: 2,
    visibility: 'public',
  }
}

describe('InlineMomentEditor', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(updateEntryContent).mockReset()
  })

  it('seeds from the on-screen moment and saves the edited text', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    const updated = buildUpdatedEntry(
      'Edited body with ěščř and ⛰',
      'Edited title',
    )
    vi.mocked(updateEntryContent).mockResolvedValue(updated)

    render(
      <InlineMomentEditor
        creatorId={creatorId}
        entryId={entryId}
        initialBody="Original body"
        initialTitle="Original title"
        onCancel={vi.fn()}
        onUpdated={onUpdated}
      />,
    )

    const titleField = screen.getByLabelText('Název')
    const bodyField = screen.getByLabelText('Příběh')
    expect(titleField).toHaveValue('Original title')
    expect(bodyField).toHaveValue('Original body')
    expect(screen.getByRole('button', { name: 'Uložit změny' })).toBeDisabled()

    await user.clear(titleField)
    await user.type(titleField, 'Edited title')
    await user.clear(bodyField)
    await user.type(bodyField, 'Edited body with ěščř and ⛰')
    await user.click(screen.getByRole('button', { name: 'Uložit změny' }))

    await waitFor(() => {
      expect(updateEntryContent).toHaveBeenCalledTimes(1)
    })
    expect(updateEntryContent).toHaveBeenCalledWith(entryId, creatorId, {
      body: 'Edited body with ěščř and ⛰',
      title: 'Edited title',
    })
    expect(onUpdated).toHaveBeenCalledWith(updated)
  })

  it('keeps the written text and stays editable when save fails', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    vi.mocked(updateEntryContent).mockRejectedValue(new Error('offline'))

    render(
      <InlineMomentEditor
        creatorId={creatorId}
        entryId={entryId}
        initialBody="Original body"
        initialTitle="Original title"
        onCancel={vi.fn()}
        onUpdated={onUpdated}
      />,
    )

    const bodyField = screen.getByLabelText('Příběh')
    await user.clear(bodyField)
    await user.type(bodyField, 'Draft that must not disappear')
    await user.click(screen.getByRole('button', { name: 'Uložit změny' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Moment se nepodařilo uložit',
    )
    expect(bodyField).toHaveValue('Draft that must not disappear')
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Uložit změny' })).toBeEnabled()
  })

  it('exits immediately when nothing changed', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')

    render(
      <InlineMomentEditor
        creatorId={creatorId}
        entryId={entryId}
        initialBody="Original body"
        initialTitle="Original title"
        onCancel={onCancel}
        onUpdated={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Zrušit' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('asks before discarding unsaved writing', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <InlineMomentEditor
        creatorId={creatorId}
        entryId={entryId}
        initialBody="Original body"
        initialTitle="Original title"
        onCancel={onCancel}
        onUpdated={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Příběh'), ' more')
    await user.click(screen.getByRole('button', { name: 'Zrušit' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Příběh')).toHaveValue('Original body more')
    confirmSpy.mockRestore()
  })

  it('ignores repeated save clicks while a mutation is in flight', async () => {
    const user = userEvent.setup()
    let resolveSave: (entry: Entry) => void = () => undefined
    vi.mocked(updateEntryContent).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        }),
    )

    render(
      <InlineMomentEditor
        creatorId={creatorId}
        entryId={entryId}
        initialBody="Original body"
        initialTitle="Original title"
        onCancel={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Příběh'), ' more')
    const saveButton = screen.getByRole('button', { name: 'Uložit změny' })
    await user.click(saveButton)
    await user.click(saveButton)

    expect(updateEntryContent).toHaveBeenCalledTimes(1)
    resolveSave(buildUpdatedEntry('Original body more', 'Original title'))
    await waitFor(() => {
      expect(screen.queryByText('Ukládám…')).not.toBeInTheDocument()
    })
  })
})
