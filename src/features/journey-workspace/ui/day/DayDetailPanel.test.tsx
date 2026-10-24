import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, uuid } from '@/features/journey-workspace/test-fixtures'
import {
  DayDetailPanel,
  type DayDetailPanelProps,
} from '@/features/journey-workspace/ui/day/DayDetailPanel'

vi.mock('@tanstack/react-router', async () => {
  const { MockLink } = await import('@/features/journey-workspace/test-router')
  return { Link: MockLink }
})
const flag = vi.hoisted(() => ({ corrections: false }))
vi.mock('@/features/media-corrections/model/enabled', () => ({
  isMediaCorrectionsEnabled: () => flag.corrections,
}))
vi.mock('@/features/media-corrections/ui/FixTimeLocationSheet', () => ({
  FixTimeLocationSheet: ({ items }: { items: { id: string }[] }) => (
    <div role="dialog" aria-label="Fix sheet">
      {items.length}
    </div>
  ),
}))
const noteApi = vi.hoisted(() => ({
  byDate: new Map<string, string>(),
  save: vi.fn(),
}))
vi.mock('@/entities/day-note/api/use-day-notes', () => ({
  useDayNotes: () => noteApi,
}))
vi.mock('maplibre-gl', () => {
  class Chain {
    addTo() {
      return this
    }
    setLngLat() {
      return this
    }
    remove() {
      return undefined
    }
  }
  class MapMock {
    addControl() {
      return undefined
    }
    fitBounds() {
      return undefined
    }
    on() {
      return undefined
    }
    remove() {
      return undefined
    }
  }
  class Bounds {
    extend() {
      return this
    }
  }
  return {
    default: {
      AttributionControl: vi.fn(),
      LngLatBounds: Bounds,
      Map: MapMock,
      Marker: Chain,
    },
  }
})
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('@/shared/lib/map-style', () => ({ getAppMapStyle: () => ({}) }))

function entry(
  n: number,
  startsAt: string,
  endsAt: string,
  media: ReturnType<typeof med>[],
  over: Parameters<typeof mom>[1] = {},
): WorkspaceMoment {
  return {
    cover: null,
    media,
    moment: mom(n, { endsAt, startsAt, ...over }),
    photoCount: media.length,
    tz: 'Europe/Prague',
    videoCount: 0,
  }
}

const A = med(21, { capturedAt: '2026-06-03T08:00:00Z', momentId: uuid(1) })
const B = med(22, {
  capturedAt: '2026-06-03T08:05:00Z',
  momentId: uuid(1),
  starred: true,
})
const C = med(23, { capturedAt: '2026-06-03T08:09:00Z', momentId: uuid(1) })
const D = med(24, { capturedAt: '2026-06-03T14:00:00Z', momentId: uuid(2) })

const moments = [
  entry(1, '2026-06-03T08:00:00Z', '2026-06-03T08:30:00Z', [A, B, C], {
    body: 'Morning text',
    title: 'Lake',
  }),
  entry(2, '2026-06-03T14:00:00Z', '2026-06-03T14:30:00Z', [D], {
    title: 'Pass',
  }),
]

function edits(): WorkspaceEdits {
  return {
    saveMomentText: vi.fn().mockResolvedValue(true),
    toggleStar: vi.fn().mockResolvedValue(true),
    trashMedia: vi.fn().mockResolvedValue(true),
  } as unknown as WorkspaceEdits
}

function setup(over: Partial<DayDetailPanelProps> = {}) {
  const props: DayDetailPanelProps = {
    actions: {
      createStop: vi.fn().mockResolvedValue(true),
      moveMedia: vi.fn().mockResolvedValue(true),
    },
    baseUrl: 'https://m.example',
    canEdit: true,
    crumb: 'Rockies',
    dayKey: '2026-06-03',
    dayLabel: 'Wednesday 3 June',
    dayNumber: 9,
    days: [
      { key: '2026-06-02', label: '2 June' },
      { key: '2026-06-03', label: '3 June' },
    ],
    edits: edits(),
    journeyId: uuid(999),
    locale: 'en',
    moments,
    onClose: vi.fn(),
    onNext: vi.fn(),
    onOpenMedia: vi.fn(),
    onPrev: vi.fn(),
    onSelectDay: vi.fn(),
    placeNames: new Map(),
    ...over,
  }
  render(<DayDetailPanel {...props} />)
  return props
}

const photoButton = (index: number) =>
  within(screen.getAllByTestId('day-photo')[index]!).getAllByRole('button')[0]!

beforeAll(async () => {
  await i18n.changeLanguage('en')
})
beforeEach(() => {
  noteApi.byDate = new Map()
  noteApi.save.mockReset().mockResolvedValue(true)
})
afterEach(cleanup)

describe('DayDetailPanel status chips', () => {
  const unsorted = (over: Partial<WorkspaceMoment>): WorkspaceMoment[] => [
    {
      ...moments[0]!,
      media: [
        { ...A, reviewedAt: null },
        { ...B, reviewedAt: '2026-06-04T10:00:00Z' },
      ],
      ...over,
    },
  ]

  it('links the remaining count to the batch sorter and flags the missing note', () => {
    setup({ moments: unsorted({}) })
    const status = screen.getByTestId('day-status')
    const link = within(status).getByRole('link', { name: '1 left to sort' })
    expect(link.getAttribute('href')).toBe(`/j/${uuid(999)}/batch`)
    expect(within(status).getByText('Day note missing')).toBeTruthy()
    expect(within(status).queryByText('Photos sorted')).toBeNull()
  })

  it('shows sorted photos and no missing-note chip when all is done', () => {
    noteApi.byDate = new Map([['2026-06-03', 'Text']])
    setup({
      moments: unsorted({
        media: [{ ...A, reviewedAt: '2026-06-04T10:00:00Z' }],
      }),
    })
    const status = screen.getByTestId('day-status')
    expect(within(status).getByText('Photos sorted')).toBeTruthy()
    expect(within(status).getByText('Note')).toBeTruthy()
    expect(within(status).queryByRole('link')).toBeNull()
    expect(within(status).queryByText('Day note missing')).toBeNull()
  })

  it('treats media without reviewedAt as sorted', () => {
    setup()
    const status = screen.getByTestId('day-status')
    expect(within(status).getByText('Photos sorted')).toBeTruthy()
    expect(within(status).queryByRole('link')).toBeNull()
  })
})

describe('DayDetailPanel', () => {
  it('shows the title, meta line, stops with text and photo counts', () => {
    setup()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Wednesday 3 June',
    )
    expect(screen.getByText('Day 9 · 4 photos · 2 stops')).toBeTruthy()
    expect(screen.getAllByTestId('day-stop')).toHaveLength(2)
    expect(screen.getByText('Morning text')).toBeTruthy()
    expect(screen.getByText(/travel/)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Split the day here' }),
    ).toBeDisabled()
  })

  it('opens the viewer on a plain click', () => {
    const props = setup()
    fireEvent.click(photoButton(1))
    expect(props.onOpenMedia).toHaveBeenCalledTimes(1)
  })

  it('selects with Cmd-click and Shift-range, then acts on the selection', async () => {
    const props = setup()
    fireEvent.click(photoButton(0), { metaKey: true })
    expect(props.onOpenMedia).not.toHaveBeenCalled()
    expect(screen.getByRole('toolbar')).toHaveTextContent('Selected 1 photo')
    // hero (starred B) is shown first: order is B, A, C, D
    fireEvent.click(photoButton(2), { shiftKey: true })
    expect(screen.getByRole('toolbar')).toHaveTextContent('Selected 3 photos')

    fireEvent.click(screen.getByRole('button', { name: /Best/ }))
    await waitFor(() => {
      expect(props.edits.toggleStar).toHaveBeenCalledTimes(2) // B was already starred
    })
  })

  it('offers "Time and location" on the selection only with the flag on', () => {
    setup()
    fireEvent.click(photoButton(0), { metaKey: true })
    expect(
      screen.queryByRole('button', { name: 'Time and location' }),
    ).toBeNull()
    cleanup()
    flag.corrections = true
    setup()
    fireEvent.click(photoButton(0), { metaKey: true })
    fireEvent.click(photoButton(2), { shiftKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Time and location' }))
    expect(screen.getByRole('dialog', { name: 'Fix sheet' })).toHaveTextContent(
      '3',
    )
    flag.corrections = false
  })

  it('moves the selection to a stop, creates a stop and trashes', async () => {
    const props = setup()
    fireEvent.click(photoButton(3), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Move to stop…' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /1\. Lake/ }))
    await waitFor(() => {
      expect(props.actions.moveMedia).toHaveBeenCalledWith([D], uuid(1))
    })
    expect(screen.queryByRole('toolbar')).toBeNull()

    fireEvent.click(photoButton(0), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'New stop' }))
    await waitFor(() => {
      expect(props.actions.createStop).toHaveBeenCalledWith([B])
    })

    fireEvent.click(photoButton(0), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'To trash' }))
    await waitFor(() => {
      expect(props.edits.trashMedia).toHaveBeenCalledWith([B])
    })
  })

  it('Escape clears the selection first, then closes; arrows change day', () => {
    const props = setup()
    fireEvent.click(photoButton(0), { metaKey: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(props.onNext).toHaveBeenCalledTimes(1)
    expect(props.onPrev).toHaveBeenCalledTimes(1)
  })

  it('ignores shortcuts while typing and when disabled', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Day note' }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowRight' })
    expect(props.onNext).not.toHaveBeenCalled()
    cleanup()
    const off = setup({ shortcutsActive: false })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(off.onNext).not.toHaveBeenCalled()
  })

  it('saves the day note under the day key', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Day note' }))
    const area = await screen.findByRole('textbox')
    fireEvent.change(area, { target: { value: 'Great day' } })
    fireEvent.blur(area)
    await waitFor(() => {
      expect(noteApi.save).toHaveBeenCalledWith('2026-06-03', 'Great day')
    })
  })

  it('edits the text of a stop through saveMomentText', async () => {
    const props = setup()
    fireEvent.click(screen.getByText('Morning text'))
    const area = await screen.findByRole('textbox', {
      name: 'Text of the stop',
    })
    fireEvent.change(area, { target: { value: 'Edited' } })
    fireEvent.blur(area)
    await waitFor(() => {
      expect(props.edits.saveMomentText).toHaveBeenCalledWith(
        moments[0]?.moment,
        { body: 'Edited', title: 'Lake' },
      )
    })
  })

  it('hides editing controls without edit rights', () => {
    setup({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Day note' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Add text' })).toBeNull()
    fireEvent.click(photoButton(0), { metaKey: true })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('switches days from the side list', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: '2 June' }))
    expect(props.onSelectDay).toHaveBeenCalledWith('2026-06-02')
  })
})
