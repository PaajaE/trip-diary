import {
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
vi.mock('@/features/journey-workspace/api/use-journey-workspace', () => ({
  useJourneyWorkspace: () => ({
    status: 'ready',
    tree: buildWorkspaceTree(
      [],
      [mom(50, { title: 'Old Town' }), mom(51, { title: 'Harbour' })],
      [],
    ),
  }),
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
  MediaViewer: ({ startId }: { startId: string }) => (
    <div data-testid="viewer">{startId}</div>
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

  it('Done sorts the selection and clears it', async () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[0]!)
    fireEvent.click(tiles()[1]!)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(actions.done).toHaveBeenCalledWith([a1, a2])
    await waitFor(() => {
      expect(screen.queryByRole('toolbar')).toBeNull()
    })
  })

  it('moves the selection into a chosen stop', async () => {
    render(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(tiles()[3]!)
    fireEvent.click(screen.getByRole('button', { name: 'Move to stop…' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2)
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Harbour/ }))
    expect(actions.moveTo).toHaveBeenCalledWith(
      [b1],
      expect.stringMatching(/^0000/),
    )
    await waitFor(() => {
      expect(screen.queryByRole('toolbar')).toBeNull()
    })
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
    fireEvent.click(screen.getByRole('button', { name: /★/ }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
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
    expect(screen.getByRole('link', { name: 'Import media' })).toHaveAttribute(
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

  it('shows loading and a retry on error', () => {
    state.query.data = undefined
    const { rerender } = render(<BatchPage journeyId="j" />)
    expect(screen.getByText('Loading…')).toBeTruthy()
    state.query.isError = true
    rerender(<BatchPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(state.query.refetch).toHaveBeenCalled()
  })
})
