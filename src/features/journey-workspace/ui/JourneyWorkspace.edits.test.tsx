import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { JourneyWorkspaceState } from '@/features/journey-workspace/api/use-journey-workspace'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg } from '@/features/journey-workspace/test-fixtures'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'

const edits = vi.hoisted(() => ({
  acceptSegment: vi.fn(),
  mergeMoments: vi.fn(),
  moveBoundary: vi.fn(),
  rejectSegment: vi.fn(),
  saveCaption: vi.fn(),
  setCover: vi.fn(),
  splitMoment: vi.fn(),
  toggleStar: vi.fn(),
}))
vi.mock('@/entities/journey/api/use-journey-cover-query', () => ({
  useJourneyCoverQuery: () => ({ data: null }),
}))
vi.mock('@/features/journey-workspace/api/use-workspace-edits', () => ({
  useWorkspaceEdits: () => edits,
}))
let state: JourneyWorkspaceState = { status: 'loading' }
vi.mock('@/features/journey-workspace/api/use-journey-workspace', () => ({
  useJourneyWorkspace: () => state,
}))
vi.mock('@/features/journey-workspace/ui/WorkspaceMap', () => ({
  WorkspaceMap: () => null,
}))

function render(ui: ReactElement) {
  return rtlRender(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  )
}

const T = (hhmm: string, day = '02') => `2026-01-${day}T${hhmm}:00+00:00`

function load() {
  const a = seg(1, {
    endsAt: T('00:00', '05'),
    origin: 'suggested',
    startsAt: T('00:00', '01'),
    title: 'Alpha',
  })
  const b = seg(2, {
    endsAt: T('00:00', '09'),
    startsAt: T('00:00', '05'),
    title: 'Beta',
  })
  const m1 = mom(10, { endsAt: T('11:00'), startsAt: T('10:00'), title: 'One' })
  const m2 = mom(11, { endsAt: T('15:00'), startsAt: T('14:00'), title: 'Two' })
  state = {
    status: 'ready',
    tree: buildWorkspaceTree(
      [a, b],
      [m1, m2],
      [
        med(20, { capturedAt: T('10:10'), momentId: m1.id }),
        med(21, { capturedAt: T('10:40'), momentId: m1.id }),
        med(22, { capturedAt: T('14:30'), momentId: m2.id }),
      ],
    ),
  }
}

function splitButton(index: number): HTMLElement {
  const button = screen.getAllByRole('button', { name: 'Split moment' })[index]
  if (button === undefined) throw new Error('split button missing')
  return button
}

describe('workspace structure editing', () => {
  beforeEach(async () => {
    for (const fn of Object.values(edits))
      fn.mockReset().mockResolvedValue(true)
    await i18n.changeLanguage('en')
    load()
  })
  afterEach(() => {
    cleanup()
  })

  it('accepts and rejects a suggested segment, only for suggested ones', () => {
    render(<JourneyWorkspace journeyId="j" />)
    expect(screen.getAllByText('Suggested')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(edits.acceptSegment).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Alpha' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(edits.rejectSegment).toHaveBeenCalledOnce()
  })

  it('merges with the next moment after confirmation, warning there is no undo', async () => {
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Merge with next' }))
    const dialog = screen.getByRole('dialog', { name: 'Merge moments' })
    expect(within(dialog).getByText(/cannot be undone/)).toBeTruthy()
    expect(dialog.textContent).toContain('"Two" into "One"')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }))
    expect(edits.mergeMoments).toHaveBeenCalledWith(
      expect.stringMatching(/10$/),
      expect.stringMatching(/11$/),
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('closes a dialog with Escape without calling anything', () => {
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Merge with next' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(edits.mergeMoments).not.toHaveBeenCalled()
  })

  it('offers no merge-with-previous on the first moment', () => {
    render(<JourneyWorkspace journeyId="j" />)
    expect(
      screen.getAllByRole('button', { name: 'Merge with previous' }),
    ).toHaveLength(1)
  })

  it('splits between two media in the media time zone', async () => {
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(splitButton(0))
    const dialog = screen.getByRole('dialog', { name: 'Split moment' })
    const confirm = within(dialog).getByRole('button', { name: 'Split' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    // 10:40 UTC is 11:40 in Europe/Prague.
    fireEvent.click(within(dialog).getByRole('radio', { name: /11:40/ }))
    fireEvent.click(confirm)
    expect(edits.splitMoment).toHaveBeenCalledWith(
      expect.stringMatching(/10$/),
      T('10:40'),
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('explains when a moment with one media cannot be split', () => {
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(splitButton(1))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/cannot be split/)).toBeTruthy()
    expect(
      within(dialog)
        .getByRole('button', { name: 'Split' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('moves a boundary to a chosen candidate', async () => {
    render(<JourneyWorkspace journeyId="j" />)
    fireEvent.click(
      screen.getByRole('button', { name: /Move boundary: Alpha/ }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Move boundary' })
    fireEvent.click(within(dialog).getByRole('radio', { name: /11:00/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }))
    expect(edits.moveBoundary).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Alpha' }),
      expect.objectContaining({ title: 'Beta' }),
      T('10:00'),
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
