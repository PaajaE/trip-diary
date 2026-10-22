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
import { ToastProvider } from '@/shared/ui/ToastProvider'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'
import { JourneyWorkspaceDay } from '@/features/journey-workspace/ui/JourneyWorkspaceDay'

const edits = vi.hoisted(() => ({
  acceptSegment: vi.fn(),
  deleteMoment: vi.fn(),
  trashMedia: vi.fn(),
  mergeMoments: vi.fn(),
  moveBoundary: vi.fn(),
  rejectSegment: vi.fn(),
  saveCaption: vi.fn(),
  setCover: vi.fn(),
  splitMoment: vi.fn(),
  toggleStar: vi.fn(),
}))
// The header links to the import page; no router is mounted in these tests.
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', async () => {
  const { MockLink } = await import('@/features/journey-workspace/test-router')
  return { Link: MockLink, useNavigate: () => navigate }
})
const dayNotes = vi.hoisted(() => ({ byDate: new Map<string, string>() }))
vi.mock('@/entities/day-note/api/use-day-notes', () => ({
  useDayNotes: () => ({ byDate: dayNotes.byDate, save: vi.fn() }),
}))
vi.mock('@/features/moment-tags/api/use-moment-tags', () => ({
  useJourneyMomentTags: () => ({
    byMoment: new Map(),
    catalog: [],
    edits: { addFree: vi.fn(), addSpecies: vi.fn(), toggle: vi.fn() },
    loadFailed: false,
  }),
}))
vi.mock('@/entities/journey/api/use-journey-cover-query', () => ({
  useJourneyCoverQuery: () => ({ data: null }),
}))
const canEditState = vi.hoisted(() => ({ canEdit: true, ready: true }))
vi.mock('@/features/journey-workspace/api/use-can-edit-journey', () => ({
  useCanEditJourney: () => canEditState,
}))
const placeJob = vi.hoisted(() => vi.fn())
vi.mock('@/features/journey-workspace/api/use-resolve-missing-places', () => ({
  useResolveMissingPlaces: (...args: unknown[]) => {
    placeJob(...args)
    return null
  },
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

/** The day page of 2 Jan, where both fixture stops are. */
function Day() {
  return <JourneyWorkspaceDay date="2026-01-02" journeyId="j" />
}

function render(ui: ReactElement) {
  return rtlRender(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
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

/** Opens the "..." sheet of the moment with this name and picks an action. */
function chooseMomentAction(moment: string, action: string) {
  fireEvent.click(
    screen.getByRole('button', { name: `More actions: ${moment}` }),
  )
  const sheet = screen.getByRole('dialog', { name: moment })
  fireEvent.click(within(sheet).getByRole('button', { name: action }))
}

describe('workspace structure editing', () => {
  beforeEach(async () => {
    for (const fn of Object.values(edits))
      fn.mockReset().mockResolvedValue(true)
    edits.deleteMoment.mockResolvedValue('deleted')
    placeJob.mockClear()
    navigate.mockReset()
    canEditState.canEdit = true
    await i18n.changeLanguage('en')
    load()
  })
  afterEach(() => {
    cleanup()
  })

  it('accepts and rejects a suggested segment, only for suggested ones', () => {
    render(<JourneyWorkspace journeyId="j" />)
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(edits.acceptSegment).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Alpha' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(edits.rejectSegment).toHaveBeenCalledOnce()
  })

  it('merges with the next moment after confirmation, warning there is no undo', async () => {
    render(<Day />)
    chooseMomentAction('One', 'Merge with next')
    const dialog = screen.getByRole('dialog', { name: 'Merge stops' })
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

  it('deletes a moment with the chosen mode, naming the photo count', async () => {
    render(<Day />)
    chooseMomentAction('One', 'Delete stop…')
    const dialog = screen.getByRole('dialog', { name: 'Delete stop' })
    expect(dialog.textContent).toContain('2 photos')
    expect(dialog.textContent).toContain('can be restored on the Trash tab')
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete stop',
    })
    // No default: the user must pick what happens to the photos.
    expect(confirm).toBeDisabled()
    fireEvent.click(
      within(dialog).getByLabelText(
        'Delete the stop and its photos (to the trash)',
      ),
    )
    fireEvent.click(confirm)
    expect(edits.deleteMoment).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'One' }),
      'trash_media',
    )
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('deletes a moment but keeps its photos in the neighbouring moment', () => {
    render(<Day />)
    chooseMomentAction('Two', 'Delete stop…')
    const dialog = screen.getByRole('dialog', { name: 'Delete stop' })
    fireEvent.click(
      within(dialog).getByLabelText(
        'Delete the stop, move its photos to the neighbouring one',
      ),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete stop' }))
    expect(edits.deleteMoment).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Two' }),
      'keep_media',
    )
  })

  it('moves the photo to the trash with Del in the viewer', () => {
    render(<Day />)
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Open photo or video' })[0]!,
    )
    expect(screen.getByRole('dialog', { name: 'Photo viewer' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Delete' })
    expect(edits.trashMedia).toHaveBeenCalledWith([
      expect.objectContaining({ id: expect.stringMatching(/20$/) }),
    ])
  })

  it('keeps the delete dialog open with a hint when keep_media has no neighbour', async () => {
    edits.deleteMoment.mockResolvedValue('no_neighbour')
    render(<Day />)
    chooseMomentAction('One', 'Delete stop…')
    const dialog = screen.getByRole('dialog', { name: 'Delete stop' })
    fireEvent.click(
      within(dialog).getByLabelText(
        'Delete the stop, move its photos to the neighbouring one',
      ),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete stop' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'Delete the stop and its photos (to the trash)',
    )
    expect(screen.getByRole('dialog', { name: 'Delete stop' })).toBeTruthy()
  })

  it('runs the place job only for users who can edit the journey', () => {
    render(<Day />)
    expect(placeJob.mock.calls.at(-1)?.[2]).toBe(true)
    cleanup()
    canEditState.canEdit = false
    render(<Day />)
    expect(placeJob.mock.calls.at(-1)?.[2]).toBe(false)
  })

  it('closes a dialog with Escape without calling anything', () => {
    render(<Day />)
    chooseMomentAction('One', 'Merge with next')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(edits.mergeMoments).not.toHaveBeenCalled()
    // Escape belongs to the dialog: it must not also leave the day page.
    expect(navigate).not.toHaveBeenCalled()
  })

  it('offers no merge-with-previous on the first moment', () => {
    render(<Day />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions: One' }))
    expect(
      screen.queryByRole('button', { name: 'Merge with previous' }),
    ).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'More actions: Two' }))
    expect(
      screen.getByRole('button', { name: 'Merge with previous' }),
    ).toBeTruthy()
  })

  it('splits between two media in the media time zone', async () => {
    render(<Day />)
    chooseMomentAction('One', 'Split stop')
    const dialog = screen.getByRole('dialog', { name: 'Split stop' })
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
    render(<Day />)
    chooseMomentAction('Two', 'Split stop')
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

  it('keeps secondary moment actions out of the page until the menu opens', () => {
    render(<Day />)
    expect(screen.queryByRole('button', { name: 'Split stop' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Merge with next' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions: One' }))
    const sheet = screen.getByRole('dialog', { name: 'One' })
    expect(within(sheet).getByRole('button', { name: 'Tags' })).toBeTruthy()
    expect(
      within(sheet).getByRole('button', { name: 'Split stop' }),
    ).toBeTruthy()
  })
})
