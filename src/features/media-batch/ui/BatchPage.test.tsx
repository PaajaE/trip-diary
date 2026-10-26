import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { BatchActions } from '@/features/media-batch/api/use-batch-actions'
import { BatchPage } from '@/features/media-batch/ui/BatchPage'
import { med, mom } from '@/features/journey-workspace/test-fixtures'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'

const state = vi.hoisted(() => ({
  canEdit: true,
  uploaders: {
    currentUserId: null as string | null,
    multi: false,
    names: new Map<string, string>(),
  },
  query: {
    data: undefined as MediaItem[] | undefined,
    isError: false,
    refetch: vi.fn(),
  },
}))
const actions = vi.hoisted(() => ({
  done: vi.fn(() => Promise.resolve(true)),
  edits: {},
  moveTo: vi.fn(() => Promise.resolve(true)),
  newStop: vi.fn(() => Promise.resolve(true)),
  star: vi.fn(() => Promise.resolve()),
  trash: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('@/entities/media/api/use-unreviewed-media-query', () => ({
  useUnreviewedMediaQuery: () => state.query,
}))
vi.mock('@/features/journey-workspace/api/use-can-edit-journey', () => ({
  useCanEditJourney: () => ({ canEdit: state.canEdit, ready: true }),
}))
vi.mock('@/features/journey-workspace/api/use-tree-place-names', () => ({
  useTreePlaceNames: () => new Map<string, string>(),
}))
vi.mock('@/features/journey-workspace/api/use-journey-workspace', () => ({
  useJourneyWorkspace: () => ({
    status: 'ready',
    tree: buildWorkspaceTree(
      [],
      [
        mom(50, { title: 'Old Town' }),
        mom(51, {
          endsAt: '2026-01-03T10:00:00+00:00',
          startsAt: '2026-01-03T08:00:00+00:00',
          title: 'Harbour',
        }),
      ],
      [],
    ),
  }),
}))
vi.mock('@/features/media-batch/api/use-journey-uploaders', () => ({
  useJourneyUploaders: () => state.uploaders,
}))
vi.mock('@/features/media-batch/api/use-batch-actions', () => ({
  useBatchActions: (): BatchActions => actions as unknown as BatchActions,
}))
vi.mock('@/features/journey-organize/ui/OrganizeJourneyButton', () => ({
  OrganizeJourneyButton: () => (
    <button type="button">Organize automatically</button>
  ),
}))
vi.mock('@/features/journey-workspace/ui/MediaViewer', () => ({
  MediaViewer: ({
    onFixTimeLocation,
    startId,
  }: {
    onFixTimeLocation?: (item: { id: string }) => void
    startId: string
  }) => (
    <div data-testid="viewer">
      {startId}
      {onFixTimeLocation === undefined ? null : (
        <button
          type="button"
          onClick={() => {
            onFixTimeLocation({ id: startId })
          }}
        >
          Viewer time and location
        </button>
      )}
    </div>
  ),
}))
vi.mock('@/features/media-corrections/ui/FixTimeLocationSheet', () => ({
  FixTimeLocationSheet: ({
    items,
    onClose,
  }: {
    items: { id: string }[]
    onClose: () => void
  }) => (
    <div role="dialog" aria-label="Fix sheet">
      {items.map((item) => item.id).join(',')}
      <button type="button" onClick={onClose}>
        Close fix
      </button>
    </div>
  ),
}))

// Two days (Prague, UTC+1 in January) and one undated item.
const a1 = med(1, { capturedAt: '2026-01-02T09:00:00+00:00' })
const a2 = med(2, { capturedAt: '2026-01-02T10:00:00+00:00', starred: true })
const a3 = med(3, { capturedAt: '2026-01-02T11:00:00+00:00' })
const b1 = med(4, { capturedAt: '2026-01-03T09:00:00+00:00' })
const u1 = med(5, { capturedAt: null, capturedTz: null })
const ALL = [a1, a2, a3, b1, u1]

function tiles() {
  return screen.getAllByTestId('batch-tile')
}

beforeEach(async () => {
  vi.clearAllMocks()
  state.canEdit = true
  state.uploaders = { currentUserId: null, multi: false, names: new Map() }
  state.query.data = ALL
  state.query.isError = false
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('BatchPage', () => {
  it('shows the remaining counter and the media grouped by local day', () => {
    render(<BatchPage journeyId="j" />)
    expect(screen.getByTestId('batch-remaining')).toHaveTextContent(
      'Left to sort: 5',
    )
    const days = screen.getAllByTestId('batch-day')
    expect(days).toHaveLength(3)
    expect(within(days[0]!).getAllByTestId('batch-tile')).toHaveLength(3)
    expect(within(days[1]!).getAllByTestId('batch-tile')).toHaveLength(1)
    expect(within(days[2]!).getByText('No date')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Organize automatically' }),
    ).toBeTruthy()
  })

  it('opens the viewer on a tile outside selection mode', () => {
    render(<BatchPage journeyId="j" />)
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.click(tiles()[1]!)
    expect(screen.getByTestId('viewer')).toHaveTextContent(a2.id)
  })

  it('enters selection mode with "Select", selects tiles and shows the bar', () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByRole('toolbar')).toBeTruthy()
    fireEvent.click(tiles()[3]!)
    fireEvent.click(tiles()[0]!)
    expect(screen.getByTestId('batch-selected')).toHaveTextContent(
      'Selected 2 photos',
    )
    expect(screen.queryByTestId('viewer')).toBeNull()
    // Shift selects the range in reading order.
    fireEvent.click(tiles()[2]!, { shiftKey: true })
    expect(screen.getByTestId('batch-selected')).toHaveTextContent(
      'Selected 4 photos',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('"Select day" selects and deselects the whole day', () => {
    render(<BatchPage journeyId="j" />)
    const first = screen.getAllByTestId('batch-day')[0]!
    fireEvent.click(within(first).getByRole('button', { name: 'Select day' }))
    expect(screen.getByTestId('batch-selected')).toHaveTextContent(
      'Selected 3 photos',
    )
    fireEvent.click(within(first).getByRole('button', { name: 'Deselect day' }))
    expect(screen.getByTestId('batch-selected')).toHaveTextContent(
      'Selected 0 photos',
    )
  })

  it('opens the fix sheet for the selection (in grid order)', () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[3]!)
    fireEvent.click(tiles()[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Time and location' }))
    expect(screen.getByRole('dialog', { name: 'Fix sheet' })).toHaveTextContent(
      `${a1.id},${b1.id}`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close fix' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the fix sheet for the single viewer item', () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(tiles()[1]!)
    fireEvent.click(
      screen.getByRole('button', { name: 'Viewer time and location' }),
    )
    expect(screen.getByRole('dialog', { name: 'Fix sheet' })).toHaveTextContent(
      a2.id,
    )
  })

  it('shows no fix entry point to viewers who cannot edit', () => {
    state.canEdit = false
    render(<BatchPage journeyId="j" />)
    fireEvent.click(tiles()[1]!)
    expect(
      screen.queryByRole('button', { name: 'Viewer time and location' }),
    ).toBeNull()
  })

  it('Done sorts the selection and clears it', async () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[0]!)
    fireEvent.click(tiles()[1]!)
    fireEvent.click(screen.getByRole('button', { name: 'Handled' }))
    expect(actions.done).toHaveBeenCalledWith([a1, a2])
    await waitFor(() => {
      expect(screen.queryByRole('toolbar')).toBeNull()
    })
  })

  it('moves the selection into a stop chosen in the Move-to sheet', async () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[3]!)
    fireEvent.click(screen.getByRole('button', { name: 'Move to stop…' }))
    const sheet = screen.getByRole('dialog', { name: 'Move 1 photo to' })
    // Harbour contains the photo in time: the suggestion sits on top ...
    const suggestion = within(sheet).getByTestId('move-sheet-suggestion')
    const harbour = within(suggestion).getByRole('button', { name: /Harbour/ })
    expect(harbour).toHaveTextContent('Suggested')
    // ... and the other stops follow, grouped under a day heading.
    const list = within(sheet).getByRole('group', { name: 'Stops' })
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    expect(
      within(list).getByRole('button', { name: /Old Town/ }),
    ).not.toHaveTextContent('Suggested')
    expect(within(list).getAllByTestId('move-sheet-day')).toHaveLength(1)
    fireEvent.click(harbour)
    expect(actions.moveTo).toHaveBeenCalledWith(
      [b1],
      expect.stringMatching(/^0000/),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => {
      expect(screen.queryByRole('toolbar')).toBeNull()
    })
  })

  it('offers previous / next stop relative to the first selected photo', () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    // a1 is nearest to "Old Town" (first), so there is no previous stop.
    fireEvent.click(tiles()[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Move to stop…' }))
    expect(screen.getByRole('button', { name: /Previous stop/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Next stop/ }))
    expect(actions.moveTo).toHaveBeenCalledWith(
      [a1],
      expect.stringMatching(/^0000/),
    )
    expect(actions.moveTo.mock.calls[0]).toEqual([[a1], mom(51).id])
  })

  it('the sheet creates a new stop from the selection and closes on Esc / backdrop', () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Move to stop…' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    // Esc closed only the sheet; the selection survives.
    expect(screen.getByRole('toolbar')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Move to stop…' }))
    fireEvent.click(screen.getByTestId('move-sheet-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Move to stop…' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'New stop from selection' }),
    )
    expect(actions.newStop).toHaveBeenCalledWith([a1])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('creates a new stop, trashes, and stars without clearing on star', async () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'New stop' }))
    expect(actions.newStop).toHaveBeenCalledWith([a1])
    await waitFor(() => {
      expect(screen.queryByRole('toolbar')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[1]!)
    fireEvent.click(
      within(screen.getByRole('toolbar')).getByRole('button', { name: /★/ }),
    )
    expect(actions.star).toHaveBeenCalledWith([a2])
    // Star alone keeps the selection (and sorts nothing).
    expect(screen.getByRole('toolbar')).toBeTruthy()
    expect(actions.done).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'To trash' }))
    expect(actions.trash).toHaveBeenCalledWith([a2])
    await waitFor(() => {
      expect(screen.queryByRole('toolbar')).toBeNull()
    })
  })

  it('keeps the selection when an action fails', async () => {
    actions.done.mockResolvedValueOnce(false)
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Handled' }))
    await waitFor(() => {
      expect(actions.done).toHaveBeenCalled()
    })
    expect(screen.getByTestId('batch-selected')).toHaveTextContent(
      'Selected 1 photo',
    )
  })

  it('drops sorted media from the selection when the list refreshes', () => {
    const { rerender } = render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[0]!)
    fireEvent.click(tiles()[1]!)
    state.query.data = ALL.filter((item) => item.id !== a1.id)
    rerender(<BatchPage journeyId="j" />)
    expect(screen.getByTestId('batch-selected')).toHaveTextContent(
      'Selected 1 photo',
    )
    expect(screen.getByTestId('batch-remaining')).toHaveTextContent(
      'Left to sort: 4',
    )
  })

  it('shows the empty state with a link to the import when nothing is left', () => {
    state.query.data = []
    render(<BatchPage journeyId="j" />)
    expect(screen.getByText('Everything is sorted')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add photos' })).toHaveAttribute(
      'href',
      '/j/$journeyId/import',
    )
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
    expect(screen.getByTestId('batch-remaining')).toHaveTextContent(
      'Left to sort: 0',
    )
  })

  it('hides every editing control for a viewer-only member', () => {
    state.canEdit = false
    render(<BatchPage journeyId="j" />)
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Select day' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Organize automatically' }),
    ).toBeNull()
    fireEvent.click(tiles()[0]!)
    expect(screen.getByTestId('viewer')).toBeTruthy()
  })

  it('opens the quick sort from the header and closes it again', () => {
    render(<BatchPage journeyId="j" />)
    expect(screen.queryByTestId('quick-sort')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quick sort' }))
    expect(screen.getByRole('dialog', { name: 'Quick sort' })).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByTestId('quick-sort')).toBeNull()
  })

  it('hides the quick sort entry for viewers and when nothing is left', () => {
    state.canEdit = false
    const { rerender } = render(<BatchPage journeyId="j" />)
    expect(screen.queryByRole('button', { name: 'Quick sort' })).toBeNull()
    state.canEdit = true
    state.query.data = []
    rerender(<BatchPage journeyId="j" />)
    expect(screen.queryByRole('button', { name: 'Quick sort' })).toBeNull()
  })

  it('shows loading and a retry on error', () => {
    state.query.data = undefined
    const { rerender } = render(<BatchPage journeyId="j" />)
    expect(screen.getByText('Loading…')).toBeTruthy()
    state.query.isError = true
    rerender(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(state.query.refetch).toHaveBeenCalled()
  })

  describe('uploaders (shared journeys)', () => {
    const ME = '00000000-0000-4000-8000-000000000997'
    const JIRINA = '00000000-0000-4000-8000-000000000998'
    const mine = med(21, {
      capturedAt: '2026-01-02T09:00:00+00:00',
      ownerId: ME,
    })
    const hers = med(22, {
      capturedAt: '2026-01-02T09:05:00+00:00',
      ownerId: JIRINA,
    })

    it('changes nothing for a single-member journey', () => {
      state.query.data = [mine, hers]
      render(<BatchPage journeyId="j" />)
      expect(screen.queryByText(/Uploaded by/)).toBeNull()
      expect(tiles()[1]).toHaveAttribute('aria-label', 'Open photo or video')
      expect(tiles()[1]).not.toHaveAttribute('title')
    })

    it('marks only other members tiles and adds a filter chip per uploader', () => {
      state.query.data = [mine, hers]
      state.uploaders = {
        currentUserId: ME,
        multi: true,
        names: new Map([[JIRINA, 'Jirina']]),
      }
      render(<BatchPage journeyId="j" />)
      expect(tiles()[0]).toHaveAttribute('aria-label', 'Open photo or video')
      expect(tiles()[1]).toHaveAttribute(
        'aria-label',
        'Open photo or video. Uploaded by Jirina',
      )
      expect(tiles()[1]).toHaveAttribute('title', 'Uploaded by Jirina')
      const chip = within(
        screen.getByRole('group', { name: 'Batch filter' }),
      ).getByRole('button', {
        name: /Uploaded by Jirina/,
      })
      expect(chip).toHaveTextContent('1')
      fireEvent.click(chip)
      expect(tiles()).toHaveLength(1)
      expect(tiles()[0]).toHaveAttribute('data-media-id', hers.id)
      expect(chip).toHaveAttribute('aria-pressed', 'true')
    })

    it('falls back to a generic text without a name', () => {
      state.query.data = [mine, hers]
      state.uploaders = { currentUserId: ME, multi: true, names: new Map() }
      render(<BatchPage journeyId="j" />)
      expect(
        within(screen.getByRole('group', { name: 'Batch filter' })).getByRole(
          'button',
          { name: /Uploaded by another member/ },
        ),
      ).toBeTruthy()
    })
  })

  describe('filters', () => {
    const geo = { latitude: 50, longitude: 14 }
    const s1 = med(11, {
      ...geo,
      capturedAt: '2026-01-02T09:00:00+00:00',
      phash: 7,
    })
    const s2 = med(12, {
      ...geo,
      capturedAt: '2026-01-02T09:00:05+00:00',
      phash: 7,
    })
    const clip = med(13, {
      ...geo,
      capturedAt: '2026-01-03T09:00:00+00:00',
      kind: 'video',
    })
    const bare = med(14, { capturedAt: '2026-01-03T10:00:00+00:00' })

    it('shows chips with counts, hiding empty ones except "All"', () => {
      render(<BatchPage journeyId="j" />)
      const chips = screen.getByRole('group', { name: 'Batch filter' })
      // All, No location and Best ★ (a2 is starred).
      expect(within(chips).getAllByRole('button')).toHaveLength(3)
      expect(
        within(chips).getByRole('button', { name: /Best ★/ }),
      ).toHaveTextContent('1')
      expect(
        within(chips).getByRole('button', { name: /All/ }),
      ).toHaveTextContent('5')
      expect(
        within(chips).getByRole('button', { name: /No location/ }),
      ).toHaveTextContent('5')
      expect(within(chips).queryByRole('button', { name: /Series/ })).toBeNull()
      expect(within(chips).queryByRole('button', { name: /Videos/ })).toBeNull()
    })

    it('filters the sections, keeps the remaining counter and shows "Showing M"', () => {
      state.query.data = [s1, s2, clip, bare]
      render(<BatchPage journeyId="j" />)
      expect(screen.queryByTestId('batch-shown')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Series/ }))
      expect(tiles()).toHaveLength(2)
      expect(screen.getAllByTestId('batch-day')).toHaveLength(1)
      expect(screen.getByTestId('batch-remaining')).toHaveTextContent(
        'Left to sort: 4',
      )
      expect(screen.getByTestId('batch-shown')).toHaveTextContent('Showing 2')
      fireEvent.click(screen.getByRole('button', { name: /Videos/ }))
      expect(tiles()).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: /No location/ }))
      expect(tiles()).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: /All/ }))
      expect(tiles()).toHaveLength(4)
      expect(screen.queryByTestId('batch-shown')).toBeNull()
    })

    it('"Select day" and range selection act on the shown media only', () => {
      state.query.data = [s1, s2, clip, bare]
      render(<BatchPage journeyId="j" />)
      fireEvent.click(screen.getByRole('button', { name: /No location/ }))
      fireEvent.click(
        within(screen.getAllByTestId('batch-day')[0]!).getByRole('button', {
          name: 'Select day',
        }),
      )
      expect(screen.getByTestId('batch-selected')).toHaveTextContent(
        'Selected 1 photo',
      )
      // Switching the filter drops the now hidden media from the selection.
      fireEvent.click(screen.getByRole('button', { name: /Videos/ }))
      expect(screen.getByTestId('batch-selected')).toHaveTextContent(
        'Selected 0 photos',
      )
    })

    it('falls back to "All" when nothing matches the filter any more', () => {
      state.query.data = [s1, s2, clip, bare]
      const { rerender } = render(<BatchPage journeyId="j" />)
      fireEvent.click(screen.getByRole('button', { name: /Videos/ }))
      state.query.data = [s1, s2, bare]
      rerender(<BatchPage journeyId="j" />)
      expect(tiles()).toHaveLength(3)
      expect(screen.queryByTestId('batch-shown')).toBeNull()
    })
  })

  describe('press-and-hold drag selection (synthetic events, jsdom has no layout)', () => {
    const hit: { current: Element | null } = { current: null }
    const touch = (id = 1, x = 10, y = 300) => ({
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: 'touch',
    })

    beforeEach(() => {
      vi.useFakeTimers()
      hit.current = null
      document.elementFromPoint = vi.fn(() => hit.current)
      window.scrollBy = vi.fn()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function hold(index: number) {
      fireEvent.pointerDown(tiles()[index]!, touch())
      act(() => {
        vi.advanceTimersByTime(400)
      })
    }
    function dragTo(index: number, y = 300) {
      hit.current = tiles()[index]!
      fireEvent.pointerMove(tiles()[0]!, touch(1, 20, y))
    }
    const selectedText = () => screen.getByTestId('batch-selected').textContent

    it('a 400 ms hold enters selection mode, then dragging selects and shrinks a range', () => {
      render(<BatchPage journeyId="j" />)
      hold(1)
      expect(screen.getByRole('toolbar')).toBeTruthy()
      expect(selectedText()).toBe('Selected 1 photo')
      dragTo(3)
      expect(selectedText()).toBe('Selected 3 photos')
      dragTo(4)
      expect(selectedText()).toBe('Selected 4 photos')
      dragTo(2)
      expect(selectedText()).toBe('Selected 2 photos')
      dragTo(0)
      expect(selectedText()).toBe('Selected 2 photos')
      expect(tiles()[0]).toHaveAttribute('aria-pressed', 'true')
      expect(tiles()[2]).toHaveAttribute('aria-pressed', 'false')
    })

    it('locks the grid scroll only while the drag is active', () => {
      render(<BatchPage journeyId="j" />)
      const grid = screen.getAllByTestId('batch-day')[0]!.parentElement!
      expect(grid).not.toHaveClass('touch-none')
      hold(0)
      expect(grid).toHaveClass('touch-none')
      fireEvent.pointerUp(tiles()[0]!, touch())
      expect(grid).not.toHaveClass('touch-none')
    })

    it('does not open or toggle the tile when the hold ends', () => {
      render(<BatchPage journeyId="j" />)
      hold(0)
      dragTo(1)
      fireEvent.pointerUp(tiles()[0]!, touch())
      fireEvent.click(tiles()[1]!)
      expect(selectedText()).toBe('Selected 2 photos')
      expect(screen.queryByTestId('viewer')).toBeNull()
      // The next real click toggles normally again.
      fireEvent.click(tiles()[1]!)
      expect(selectedText()).toBe('Selected 1 photo')
    })

    it('moving more than 10 px before the timer means scrolling', () => {
      render(<BatchPage journeyId="j" />)
      fireEvent.pointerDown(tiles()[0]!, touch())
      fireEvent.pointerMove(tiles()[0]!, touch(1, 10, 320))
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(screen.queryByRole('toolbar')).toBeNull()
    })

    it('a small wobble or an early release does not start anything', () => {
      render(<BatchPage journeyId="j" />)
      fireEvent.pointerDown(tiles()[0]!, touch())
      fireEvent.pointerMove(tiles()[0]!, touch(1, 14, 303))
      act(() => {
        vi.advanceTimersByTime(399)
      })
      fireEvent.pointerUp(tiles()[0]!, touch())
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(screen.queryByRole('toolbar')).toBeNull()
    })

    it('ignores the mouse and viewers without edit rights', () => {
      render(<BatchPage journeyId="j" />)
      fireEvent.pointerDown(tiles()[0]!, { ...touch(), pointerType: 'mouse' })
      act(() => {
        vi.advanceTimersByTime(600)
      })
      expect(screen.queryByRole('toolbar')).toBeNull()
      cleanup()
      state.canEdit = false
      render(<BatchPage journeyId="j" />)
      fireEvent.pointerDown(tiles()[0]!, touch())
      act(() => {
        vi.advanceTimersByTime(600)
      })
      expect(screen.queryByRole('toolbar')).toBeNull()
    })

    it('keeps an earlier selection and respects an active filter', () => {
      state.query.data = [
        med(21, { capturedAt: '2026-01-02T09:00:00+00:00' }),
        med(22, { capturedAt: '2026-01-02T10:00:00+00:00', kind: 'video' }),
        med(23, { capturedAt: '2026-01-02T11:00:00+00:00' }),
        med(24, { capturedAt: '2026-01-02T12:00:00+00:00', kind: 'video' }),
      ]
      render(<BatchPage journeyId="j" />)
      fireEvent.click(screen.getByRole('button', { name: /Videos/ }))
      expect(tiles()).toHaveLength(2)
      hold(0)
      dragTo(1)
      // Only the two videos are in reading order, the photo between them is not.
      expect(selectedText()).toBe('Selected 2 photos')
      fireEvent.pointerUp(tiles()[0]!, touch())
      fireEvent.click(screen.getByRole('button', { name: /All/ }))
      expect(tiles()).toHaveLength(4)
    })

    it('scrolls the page near the viewport edges and stops on release', () => {
      render(<BatchPage journeyId="j" />)
      hold(0)
      dragTo(1, 4)
      act(() => {
        vi.advanceTimersByTime(50)
      })
      expect(window.scrollBy).toHaveBeenCalled()
      const arg = vi.mocked(window.scrollBy).mock.calls[0]?.[0] as
        | ScrollToOptions
        | undefined
      expect(arg?.top).toBeLessThan(0)
      fireEvent.pointerUp(tiles()[0]!, touch(1, 20, 4))
      vi.mocked(window.scrollBy).mockClear()
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(window.scrollBy).not.toHaveBeenCalled()
    })
  })
})
