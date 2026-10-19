import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import i18n from 'i18next'
import { useState, type PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import { useWorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import type { CoverTarget } from '@/features/journey-workspace/model/cover-targets'
import { med, uuid } from '@/features/journey-workspace/test-fixtures'
import { EditableMediaTile } from '@/features/journey-workspace/ui/EditableMediaTile'
import {
  MediaViewer,
  type ViewerGroup,
} from '@/features/journey-workspace/ui/MediaViewer'
import { ToastContext } from '@/shared/ui/toast-context'

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
const a1 = med(20, { capturedAt: '2026-01-02T22:30:00+00:00' })
const a2 = med(21)
const b1 = med(22, {
  capturedAt: '2026-01-03T10:00:00+00:00',
  capturedTz: 'Asia/Tokyo',
})
const groups: ViewerGroup[] = [
  { id: 'a', items: [a1, a2], title: 'Lake' },
  { id: 'b', items: [b1], title: 'Mountain' },
]
const targets = new Map<string, CoverTarget[]>([
  [
    a1.id,
    [
      { currentCoverId: null, level: 'moment', targetId: uuid(10) },
      { currentCoverId: a1.id, level: 'stage', targetId: uuid(1) },
      { currentCoverId: null, level: 'journey', targetId: JOURNEY },
    ],
  ],
])

let client: QueryClient

function Harness({ onDelete }: { onDelete?: (id: string) => void }) {
  const edits = useWorkspaceEdits(JOURNEY)
  const [open, setOpen] = useState<{
    opener: HTMLElement
    startId: string
  } | null>(null)
  return (
    <>
      <EditableMediaTile
        baseUrl="https://m.test"
        edits={edits}
        item={a1}
        onOpen={(i, opener) => {
          setOpen({ opener, startId: i.id })
        }}
      />
      {open !== null ? (
        <MediaViewer
          baseUrl="https://m.test"
          edits={edits}
          groups={groups}
          locale="en"
          returnFocusTo={open.opener}
          startId={open.startId}
          targets={targets}
          onClose={() => {
            setOpen(null)
          }}
          {...(onDelete === undefined
            ? {}
            : {
                onDelete: (i) => {
                  onDelete(i.id)
                },
              })}
        />
      ) : null}
    </>
  )
}
function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>
      <ToastContext.Provider value={{ showToast: () => undefined }}>
        {children}
      </ToastContext.Provider>
    </QueryClientProvider>
  )
}
function openViewer() {
  const tile = screen.getByRole('button', { name: 'Open photo or video' })
  tile.focus()
  fireEvent.click(tile)
  return tile
}
const position = () => screen.getByTestId('viewer-position').textContent

describe('MediaViewer', () => {
  beforeEach(async () => {
    client = new QueryClient()
    client.setQueryData(mediaQueryKeys.journey(JOURNEY), [a1, a2, b1])
    vi.clearAllMocks()
    repo.updateMediaMeta.mockResolvedValue(a1)
    repo.updateMoment.mockResolvedValue({})
    repo.setJourneyCover.mockResolvedValue(undefined)
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('opens as a modal dialog at the clicked item with its details', () => {
    render(<Harness />, { wrapper })
    openViewer()
    const dialog = screen.getByRole('dialog', { name: 'Photo viewer' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(position()).toBe('1 / 3')
    expect(screen.getByTestId('viewer-moment').textContent).toBe('Lake')
    // 22:30 UTC is 11:30 PM in Prague: the capture zone, not the device zone.
    expect(screen.getByText(/11:30 PM/)).toBeTruthy()
  })

  it('moves with the arrow keys across the moment boundary', () => {
    render(<Harness />, { wrapper })
    openViewer()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(position()).toBe('2 / 3')
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(position()).toBe('3 / 3')
    expect(screen.getByTestId('viewer-moment').textContent).toBe('Mountain')
    // Tokyo capture zone: 10:00 UTC is 7 PM there.
    expect(screen.getByText(/07:00 PM/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(screen.getByTestId('viewer-moment').textContent).toBe('Lake')
  })

  it('moves with the buttons and the filmstrip', () => {
    render(<Harness />, { wrapper })
    openViewer()
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(position()).toBe('2 / 3')
    fireEvent.click(screen.getByRole('button', { name: 'Show item 1 of 2' }))
    expect(position()).toBe('1 / 3')
  })

  it('moves on a horizontal swipe', () => {
    render(<Harness />, { wrapper })
    openViewer()
    const stage = screen.getByTestId('viewer-stage')
    fireEvent.touchStart(stage, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(stage, {
      changedTouches: [{ clientX: 80, clientY: 105 }],
    })
    expect(position()).toBe('2 / 3')
  })

  it('closes on Escape and returns focus to the tile', () => {
    render(<Harness />, { wrapper })
    const tile = openViewer()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(tile)
  })

  it('stars with S and offers cover actions', async () => {
    render(<Harness />, { wrapper })
    openViewer()
    fireEvent.keyDown(document, { key: 'S' })
    await waitFor(() => {
      expect(repo.updateMediaMeta).toHaveBeenCalledWith(a1.id, {
        starred: true,
      })
    })
    expect(screen.getByText('Cover: stage')).toBeTruthy()
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Already the cover of: stage',
      }).disabled,
    ).toBe(true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Use as cover of: journey' }),
    )
    await waitFor(() => {
      expect(repo.setJourneyCover).toHaveBeenCalledWith(JOURNEY, a1.id)
    })
  })

  it('focuses the caption with C, saves on Enter, and Esc there keeps the viewer open', async () => {
    render(<Harness />, { wrapper })
    openViewer()
    fireEvent.keyDown(document, { key: 'c' })
    const input = await screen.findByRole('textbox', { name: 'Caption' })
    expect(document.activeElement).toBe(input)
    // Letter and arrow shortcuts do not fire while typing.
    fireEvent.keyDown(input, { key: 'ArrowRight' })
    expect(position()).toBe('1 / 3')
    fireEvent.change(input, { target: { value: '  Sunset ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(repo.updateMediaMeta).toHaveBeenCalledWith(a1.id, {
        caption: 'Sunset',
      })
    })
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.keyDown(document, { key: 'c' })
    const second = await screen.findByRole('textbox', { name: 'Caption' })
    fireEvent.keyDown(second, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('shows later-phase actions only when their callbacks are given', () => {
    const onDelete = vi.fn()
    const { unmount } = render(<Harness />, { wrapper })
    openViewer()
    expect(
      within(screen.getByRole('dialog')).queryByRole('button', {
        name: 'Move to trash',
      }),
    ).toBeNull()
    fireEvent.keyDown(document, { key: 'Delete' })
    unmount()
    render(<Harness onDelete={onDelete} />, { wrapper })
    openViewer()
    fireEvent.keyDown(document, { key: 'Delete' })
    expect(onDelete).toHaveBeenCalledWith(a1.id)
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Move to trash',
      }),
    ).toBeTruthy()
  })

  function bare(
    list: ViewerGroup[],
    props: { returnFocusTo?: HTMLElement | null } = {},
  ) {
    return (
      <MediaViewer
        baseUrl="https://m.test"
        edits={{} as never}
        groups={list}
        locale="en"
        startId={a1.id}
        targets={targets}
        onClose={vi.fn()}
        {...props}
      />
    )
  }

  it('restores focus without scrolling the page', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    render(<Harness />, { wrapper })
    const tile = openViewer()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      focus.mock.contexts.some(
        (el, i) => el === tile && focus.mock.calls[i]?.[0]?.preventScroll,
      ),
    ).toBe(true)
    focus.mockRestore()
  })

  it('gives no focus to an opener that no longer exists', () => {
    const gone = document.createElement('button')
    const focus = vi.spyOn(gone, 'focus')
    const { unmount } = render(bare(groups, { returnFocusTo: gone }), {
      wrapper,
    })
    unmount()
    expect(focus).not.toHaveBeenCalled()
  })

  it('stays on the neighbour after the current item is trashed and restored', () => {
    const { rerender } = render(bare(groups), { wrapper })
    expect(position()).toBe('1 / 3')
    // a1 is trashed: the viewer moves on to a2 at the same position.
    rerender(
      bare([
        { id: 'a', items: [a2], title: 'Lake' },
        { id: 'b', items: [b1], title: 'Mountain' },
      ]),
    )
    expect(position()).toBe('1 / 2')
    // Undo brings a1 back: the viewer keeps showing a2 (now second).
    rerender(bare(groups))
    expect(position()).toBe('2 / 3')
  })
})
