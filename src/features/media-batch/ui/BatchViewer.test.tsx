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

// The REAL MediaViewer runs here: these tests cover the batch <-> viewer seam
// (move / extract from the viewer, neighbour adoption, closing when empty).

const state = vi.hoisted(() => ({
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
  useCanEditJourney: () => ({ canEdit: true, ready: true }),
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
  OrganizeJourneyButton: () => null,
}))

const p1 = med(1, { capturedAt: '2026-01-02T09:00:00+00:00' })
const p2 = med(2, { capturedAt: '2026-01-02T10:00:00+00:00' })
const p3 = med(3, { capturedAt: '2026-01-02T11:00:00+00:00' })

function current(): string {
  return (
    document
      .querySelector('[aria-current="true"]')
      ?.getAttribute('aria-label') ?? ''
  )
}

function openViewerOn(index: number) {
  fireEvent.click(screen.getAllByTestId('batch-tile')[index]!)
  return screen.getByRole('dialog', { name: 'Photo viewer' })
}

beforeEach(async () => {
  vi.clearAllMocks()
  state.query.data = [p1, p2, p3]
  state.query.isError = false
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('viewer inside the batch', () => {
  it('offers "Move to stop" and "Extract to a new stop"', () => {
    render(<BatchPage journeyId="j" />)
    const viewer = openViewerOn(1)
    expect(
      within(viewer).getByRole('button', { name: 'Move to stop' }),
    ).toBeTruthy()
    fireEvent.click(
      within(viewer).getByRole('button', { name: 'Extract to a new stop' }),
    )
    expect(actions.newStop).toHaveBeenCalledWith([p2])
  })

  it('moves one item through the sheet layered above the viewer', () => {
    render(<BatchPage journeyId="j" />)
    const viewer = openViewerOn(1)
    fireEvent.click(
      within(viewer).getByRole('button', { name: 'Move to stop' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Move 1 photo to' })
    expect(document.activeElement).toBe(sheet)
    fireEvent.click(within(sheet).getByRole('button', { name: /Harbour/ }))
    expect(actions.moveTo).toHaveBeenCalledWith([p2], mom(51).id)
    expect(screen.queryByRole('dialog', { name: 'Move 1 photo to' })).toBeNull()
    // The viewer stays.
    expect(screen.getByRole('dialog', { name: 'Photo viewer' })).toBeTruthy()
  })

  it('Esc and Tab belong to the sheet first, not to the viewer', () => {
    render(<BatchPage journeyId="j" />)
    openViewerOn(1)
    fireEvent.keyDown(document.body, { key: 'm' })
    const sheet = screen.getByRole('dialog', { name: 'Move 1 photo to' })
    // Viewer shortcuts are blocked while the sheet is open.
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(current()).toContain('2 ')
    // Tab cycles inside the sheet.
    const buttons = within(sheet).getAllByRole('button')
    buttons[buttons.length - 1]!.focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(sheet.contains(document.activeElement)).toBe(true)
    // Esc closes only the sheet.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Move 1 photo to' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Photo viewer' })).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Photo viewer' })).toBeNull()
  })

  it('stays open on the neighbour after the item leaves the list, and closes when empty', async () => {
    const { rerender } = render(<BatchPage journeyId="j" />)
    openViewerOn(1)
    expect(current()).toContain('2 ')
    state.query.data = [p1, p3]
    rerender(<BatchPage journeyId="j" />)
    // p3 took p2's place (position 2 of 2).
    expect(screen.getByRole('dialog', { name: 'Photo viewer' })).toBeTruthy()
    expect(current()).toContain('2 ')
    expect(current()).toContain('of 2')
    state.query.data = [p1]
    rerender(<BatchPage journeyId="j" />)
    expect(current()).toContain('1 ')
    state.query.data = []
    rerender(<BatchPage journeyId="j" />)
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Photo viewer' })).toBeNull()
    })
  })
})
