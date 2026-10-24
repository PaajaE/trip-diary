import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { JourneyWorkspaceState } from '@/features/journey-workspace/api/use-journey-workspace'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom } from '@/features/journey-workspace/test-fixtures'
import { JourneySearch } from '@/features/journey-workspace/ui/JourneySearch'
import { JourneySearchButton } from '@/features/journey-workspace/ui/JourneySearchButton'

const navigate = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  workspace: { status: 'loading' } as unknown as JourneyWorkspaceState,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))
vi.mock('@/features/journey-workspace/api/use-journey-workspace', () => ({
  useJourneyWorkspace: () => state.workspace,
}))
vi.mock('@/entities/day-note/api/use-day-notes', () => ({
  useDayNotes: () => ({
    byDate: new Map([['2026-01-03', 'Celý den u jezera']]),
    save: vi.fn(),
  }),
}))
vi.mock('@/entities/place/api/use-journey-places', () => ({
  useJourneyPlaces: () => new Map(),
}))

const OLD = '00000000-0000-4000-8000-000000000050'
function ready(): JourneyWorkspaceState {
  return {
    status: 'ready',
    tree: buildWorkspaceTree(
      [],
      [
        mom(50, { body: 'Koupání v Ježeru', title: 'Ráno u vody' }),
        mom(51, {
          startsAt: '2026-01-04T10:00:00+00:00',
          endsAt: '2026-01-04T11:00:00+00:00',
          title: 'Hory',
          published: false,
        }),
      ],
      [
        med(1, { caption: 'Západ nad jezerem', momentId: OLD, starred: true }),
        med(2, { caption: 'Jezero z dálky', momentId: OLD, kind: 'video' }),
        med(3, { caption: null, capturedAt: null, capturedTz: null }),
      ],
    ),
  }
}

const field = () => screen.getByRole('combobox')
async function type(text: string) {
  fireEvent.change(field(), { target: { value: text } })
  await act(() => vi.advanceTimersByTimeAsync(200))
}

beforeEach(async () => {
  vi.useFakeTimers()
  Element.prototype.scrollIntoView = vi.fn()
  navigate.mockReset()
  state.workspace = ready()
  await i18n.changeLanguage('cs')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('JourneySearch', () => {
  it('is a labelled modal dialog with the input focused', () => {
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Hledat v cestě' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(field())
    expect(field().getAttribute('aria-label')).not.toBeNull()
  })

  it('closes on Escape and the close button', () => {
    const onClose = vi.fn()
    render(<JourneySearch journeyId="j1" onClose={onClose} />)
    fireEvent.keyDown(field(), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít hledání' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('debounces typing by 150 ms', async () => {
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    fireEvent.change(field(), { target: { value: 'jezer' } })
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(screen.queryByRole('listbox')).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(60))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('shows grouped results ignoring accents and announces the count', async () => {
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    await type('JEZER')
    const list = screen.getByRole('listbox')
    expect(within(list).getByRole('group', { name: 'Zastávky' })).toBeTruthy()
    expect(within(list).getByRole('group', { name: 'Zápisy dnů' })).toBeTruthy()
    expect(within(list).getByRole('group', { name: 'Fotky' })).toBeTruthy()
    expect(within(list).getAllByRole('option')).toHaveLength(4)
    expect(screen.getByRole('status').textContent).toBe('Nalezeny 4 výsledky')
  })

  it('moves the selection with arrows and opens with Enter', async () => {
    const onClose = vi.fn()
    render(<JourneySearch journeyId="j1" onClose={onClose} />)
    await type('jezer')
    const options = screen.getAllByRole('option')
    expect(options[0]?.getAttribute('aria-selected')).toBe('true')
    expect(field().getAttribute('aria-activedescendant')).toBe(options[0]?.id)
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(options[1]?.getAttribute('aria-selected')).toBe('true')
    expect(field().getAttribute('aria-activedescendant')).toBe(options[1]?.id)
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(options[3]?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onClose).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({
      params: { date: '2026-01-02', journeyId: 'j1' },
      to: '/j/$journeyId/workspace/day/$date',
    })
  })

  it('opens the day of a day-note result', async () => {
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    await type('hospoda jezera')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    await type('u jezera')
    fireEvent.click(screen.getAllByRole('option')[0]!)
    expect(navigate).toHaveBeenCalledWith({
      params: { date: '2026-01-03', journeyId: 'j1' },
      to: '/j/$journeyId/workspace/day/$date',
    })
  })

  it('finds unpublished stops', async () => {
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    await type('hory')
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('lists media with filter chips alone and keeps aria-pressed', async () => {
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /Jen nejlepší/ })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('button', { name: 'Bez popisku' }))
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Videa/ }))
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('stays open when a media hit has no date', () => {
    const onClose = vi.fn()
    render(<JourneySearch journeyId="j1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bez popisku' }))
    fireEvent.click(screen.getByRole('option'))
    expect(navigate).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the empty state', async () => {
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    await type('neexistuje')
    expect(screen.getByTestId('empty-state').textContent).toContain(
      'Nic jsme nenašli pro „neexistuje“',
    )
    expect(screen.getByRole('status').textContent).toBe('Nic nenalezeno')
  })

  it('offers "show all" when there are more photos than the row', async () => {
    const media = Array.from({ length: 20 }, (_, i) =>
      med(100 + i, { caption: `Hora ${String(i)}` }),
    )
    state.workspace = {
      status: 'ready',
      tree: buildWorkspaceTree([], [], media),
    }
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    await type('hora')
    expect(screen.getAllByRole('option')).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit všech 20' }))
    expect(screen.getAllByRole('option')).toHaveLength(20)
  })

  it('traps Tab inside the dialog', () => {
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    const last = screen.getByRole('button', { name: 'Bez popisku' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(field())
    fireEvent.keyDown(field(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('works in English', async () => {
    await i18n.changeLanguage('en')
    render(<JourneySearch journeyId="j1" onClose={vi.fn()} />)
    await type('zzzz')
    expect(
      screen.getByRole('dialog', { name: 'Search the journey' }),
    ).toBeTruthy()
    expect(screen.getByTestId('empty-state').textContent).toContain(
      'We found nothing for "zzzz"',
    )
  })
})

describe('JourneySearchButton', () => {
  it('opens from the button and returns focus on close', () => {
    render(<JourneySearchButton journeyId="j1" />)
    const button = screen.getByRole('button', { name: 'Hledat' })
    button.focus()
    fireEvent.click(button)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('opens with Ctrl+K and Cmd+K', () => {
    render(<JourneySearchButton journeyId="j1" />)
    fireEvent.keyDown(document.body, { ctrlKey: true, key: 'k' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    cleanup()
    render(<JourneySearchButton journeyId="j1" />)
    fireEvent.keyDown(document.body, { key: 'K', metaKey: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('ignores the shortcut while typing or when another dialog is open', () => {
    render(
      <>
        <input aria-label="note" />
        <JourneySearchButton journeyId="j1" />
      </>,
    )
    fireEvent.keyDown(screen.getByLabelText('note'), {
      ctrlKey: true,
      key: 'k',
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()
    render(
      <>
        <div role="dialog" aria-label="other" />
        <JourneySearchButton journeyId="j1" />
      </>,
    )
    fireEvent.keyDown(document.body, { ctrlKey: true, key: 'k' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('ignores a plain K', () => {
    render(<JourneySearchButton journeyId="j1" />)
    fireEvent.keyDown(document.body, { key: 'k' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
