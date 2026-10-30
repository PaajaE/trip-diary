import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, variant } from '@/features/journey-workspace/test-fixtures'
import { QuickSortView } from '@/features/media-batch/ui/QuickSortView'

const haptics = vi.hoisted(() => ({ haptic: vi.fn() }))
vi.mock('@/shared/lib/haptics', () => haptics)
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
  }: {
    children: ReactNode
    params: Record<string, string>
    to: string
  }) => (
    <a
      href={to
        .replace('$journeyId', params.journeyId ?? '')
        .replace('$date', params.date ?? '')}
    >
      {children}
    </a>
  ),
}))

const OLD_TOWN = mom(50, {
  endsAt: '2026-01-02T10:00:00+00:00',
  startsAt: '2026-01-02T08:00:00+00:00',
  title: 'Old Town',
})
const tree = buildWorkspaceTree([], [OLD_TOWN], [])

// a inside Old Town; b and c are a series; d is on day 2 with no stop near.
const a = med(1, { capturedAt: '2026-01-02T09:00:00+00:00' })
const b = med(2, {
  capturedAt: '2026-01-02T15:00:00+00:00',
  phash: 0b1010,
  quality: { sharp: 10, v: 1 },
})
const c = med(3, {
  capturedAt: '2026-01-02T15:00:20+00:00',
  phash: 0b1011,
  quality: { sharp: 40, v: 1 },
})
const d = med(4, { capturedAt: '2026-01-03T09:00:00+00:00' })

const key = (k: string, target: Element = document.body) => {
  fireEvent.keyDown(target, { key: k })
}

interface Options {
  items?: MediaItem[]
  fail?: 'trash' | 'moveTo'
  placeNames?: ReadonlyMap<string, string>
  tree?: typeof tree | null
}

function setup(options: Options = {}) {
  const initial = options.items ?? [a, b, c, d]
  const onClose = vi.fn()
  const calls = {
    done: vi.fn(),
    moveTo: vi.fn(),
    newStop: vi.fn(),
    revert: vi.fn(() => Promise.resolve(true)),
    star: vi.fn(),
    trash: vi.fn(),
  }
  function Host() {
    const [items, setItems] = useState<MediaItem[]>(initial)
    const leave = (gone: readonly MediaItem[]) => {
      setItems((list) => list.filter((i) => !gone.some((g) => g.id === i.id)))
    }
    const actions = {
      done: (gone: readonly MediaItem[]) => {
        calls.done(gone)
        leave(gone)
        return Promise.resolve(true)
      },
      moveTo: (gone: readonly MediaItem[], momentId: string) => {
        calls.moveTo(gone, momentId)
        if (options.fail === 'moveTo') return Promise.resolve(false)
        leave(gone)
        return Promise.resolve(true)
      },
      newStop: (
        gone: readonly MediaItem[],
        opts?: { onCreated?: (id: string) => void },
      ) => {
        calls.newStop(gone)
        opts?.onCreated?.('created-stop')
        leave(gone)
        return Promise.resolve(true)
      },
      revert: calls.revert,
      star: (list: readonly MediaItem[]) => {
        calls.star(list)
        setItems((current) =>
          current.map((i) =>
            list.some((x) => x.id === i.id) ? { ...i, starred: !i.starred } : i,
          ),
        )
        return Promise.resolve()
      },
      trash: (gone: readonly MediaItem[]) => {
        calls.trash(gone)
        if (options.fail === 'trash') return Promise.resolve(false)
        leave(gone)
        return Promise.resolve(true)
      },
    }
    return (
      <QuickSortView
        actions={actions}
        baseUrl="https://m.test"
        items={items}
        journeyId="j1"
        {...(options.placeNames === undefined
          ? {}
          : { placeNames: options.placeNames })}
        tree={options.tree === undefined ? tree : options.tree}
        onClose={onClose}
      />
    )
  }
  render(<Host />)
  return { calls, onClose }
}

const progress = () => screen.getByTestId('quick-sort-progress').textContent

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('QuickSortView', () => {
  it('is a modal dialog with progress, suggestion and labelled actions', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Quick sort' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(progress()).toBe('1 of 4')
    expect(document.body.style.overflow).toBe('hidden')
    const card = screen.getByTestId('quick-sort-suggestion')
    expect(within(card).getByText('Old Town')).toBeTruthy()
    expect(within(card).getByText(/matches this stop/)).toBeTruthy()
    // The internal wording never reaches the user.
    expect(within(card).queryByText(/was taken during/)).toBeNull()
    for (const name of [
      'File here',
      'Trash',
      'Best',
      'Sorted',
      'Undo',
      'Change',
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp(name) }),
      ).toBeTruthy()
    }
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '0',
    )
  })

  it('shows the keyboard hint line only under hover and fine pointer', () => {
    setup()
    expect(screen.getByTestId('quick-sort-keyboard-hints').className).toContain(
      '[@media(hover:hover)_and_(pointer:fine)]:block',
    )
  })

  it('names the uploader in the info line only for another member of a shared journey', () => {
    const other = '00000000-0000-4000-8000-000000000996'
    const mine = '00000000-0000-4000-8000-000000000997'
    const shared = {
      currentUserId: mine,
      multi: true,
      names: new Map([[other, 'Jirina']]),
    }
    const { unmount } = render(
      <QuickSortView
        actions={{} as never}
        baseUrl="https://m.test"
        items={[{ ...a, ownerId: other }]}
        journeyId="j"
        tree={tree}
        uploaders={shared}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Uploaded by Jirina/)).toBeTruthy()
    unmount()
    render(
      <QuickSortView
        actions={{} as never}
        baseUrl="https://m.test"
        items={[{ ...a, ownerId: mine }]}
        journeyId="j"
        tree={tree}
        uploaders={shared}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Uploaded by/)).toBeNull()
  })

  it('files into the suggested stop and moves on', async () => {
    const { calls } = setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'File here' }))
    })
    expect(calls.moveTo).toHaveBeenCalledWith(
      [expect.objectContaining({ id: a.id })],
      OLD_TOWN.id,
    )
    expect(progress()).toBe('2 of 4')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '1',
    )
  })

  it('offers "New stop" as the primary action without a suggestion', async () => {
    const { calls } = setup({ items: [d, a], tree: null })
    expect(screen.getByText(/no stop to suggest/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New stop' }))
    })
    expect(calls.newStop).toHaveBeenCalledTimes(1)
  })

  it('"Change" lists every stop and files there', async () => {
    const { calls } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    const sheet = screen.getByRole('dialog', { name: 'Move 1 photo to' })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Old Town/ }))
    })
    expect(calls.moveTo).toHaveBeenCalledWith(expect.anything(), OLD_TOWN.id)
    expect(screen.queryByRole('dialog', { name: 'Move 1 photo to' })).toBeNull()
  })

  it('never sends a photo back to the stop it is already in', async () => {
    const placed = { ...a, momentId: OLD_TOWN.id }
    const { calls } = setup({ items: [placed] })
    const card = screen.getByTestId('quick-sort-suggestion')
    expect(within(card).getByText(/already in the stop Old Town/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'File here' })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep it there' }))
    })
    expect(calls.done).toHaveBeenCalledTimes(1)
    expect(calls.moveTo).not.toHaveBeenCalled()
  })

  it('shows a lookup placeholder, not a made-up "Stop 15:07", until the place is known', () => {
    const lookup = mom(60, {
      endsAt: '2026-01-02T09:05:00+00:00',
      latitude: 51,
      longitude: -115,
      placeId: 'place-1',
      startsAt: '2026-01-02T09:05:00+00:00',
    })
    const lookupTree = buildWorkspaceTree([], [lookup], [])
    const { unmount } = render(
      <QuickSortView
        actions={{} as never}
        baseUrl="https://m.test"
        items={[a]}
        journeyId="j"
        tree={lookupTree}
        onClose={vi.fn()}
      />,
    )
    const card = screen.getByTestId('quick-sort-suggestion')
    expect(within(card).getByText('Looking up the place…')).toBeTruthy()
    expect(screen.queryByText(/Stop \d{1,2}:\d{2}/)).toBeNull()
    unmount()
    render(
      <QuickSortView
        actions={{} as never}
        baseUrl="https://m.test"
        items={[a]}
        journeyId="j"
        placeNames={new Map([['place-1', 'Banff']])}
        tree={lookupTree}
        onClose={vi.fn()}
      />,
    )
    expect(
      within(screen.getByTestId('quick-sort-suggestion')).getByText('Banff'),
    ).toBeTruthy()
  })

  it('explains ★ in the tooltip, the shortcut panel and once after the first ★', async () => {
    setup()
    const star = screen.getByRole('button', { name: /^Best/ })
    expect(star.getAttribute('title')).toMatch(/cover.*mosaic.*public story/)
    expect(star.getAttribute('aria-describedby')).not.toBeNull()
    expect(screen.getByText(/★ = pick for covers/)).toBeTruthy()
    expect(screen.queryByTestId('quick-sort-star-toast')).toBeNull()
    await act(async () => {
      fireEvent.click(star)
    })
    expect(screen.getByTestId('quick-sort-star-toast').textContent).toMatch(
      /★ means best/,
    )
    expect(window.localStorage.getItem('trip-diary:star-hint-seen')).toBe('1')
  })

  it('does not repeat the ★ explanation once it was seen', async () => {
    window.localStorage.setItem('trip-diary:star-hint-seen', '1')
    setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Best/ }))
    })
    expect(screen.queryByTestId('quick-sort-star-toast')).toBeNull()
  })

  it('"Sorted" only marks as reviewed (no stop)', async () => {
    const { calls } = setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Sorted/ }))
    })
    expect(calls.done).toHaveBeenCalledTimes(1)
    expect(calls.moveTo).not.toHaveBeenCalled()
  })

  it('gives tactile feedback per action: star light, trash medium, stop success, undo light', async () => {
    setup()
    await act(async () => {
      key('s')
    })
    expect(haptics.haptic).toHaveBeenLastCalledWith('light')
    await act(async () => {
      key('x')
    })
    expect(haptics.haptic).toHaveBeenLastCalledWith('medium')
    await act(async () => {
      key('Enter')
    })
    expect(haptics.haptic).toHaveBeenLastCalledWith('success')
    await act(async () => {
      key('u')
    })
    expect(haptics.haptic).toHaveBeenLastCalledWith('light')
  })

  it('keyboard: star, trash, accept; ignored in text fields', async () => {
    const { calls } = setup()
    await act(async () => {
      key('s')
    })
    expect(calls.star).toHaveBeenCalledTimes(1)
    expect(progress()).toBe('1 of 4')
    await act(async () => {
      key('x')
    })
    expect(calls.trash).toHaveBeenCalledWith([
      expect.objectContaining({ id: a.id }),
    ])
    expect(progress()).toBe('2 of 4')
    await act(async () => {
      key('Enter')
    })
    expect(
      calls.newStop.mock.calls.length + calls.moveTo.mock.calls.length,
    ).toBe(1)

    const input = document.createElement('input')
    document.body.append(input)
    await act(async () => {
      key('x', input)
    })
    expect(calls.trash).toHaveBeenCalledTimes(1)
    input.remove()
  })

  it('Undo really reverts: trash, step into a stop, done, star', async () => {
    const { calls } = setup()
    await act(async () => {
      key('x')
    })
    await act(async () => {
      key('u')
    })
    expect(calls.revert).toHaveBeenLastCalledWith({
      createdMomentId: null,
      items: [expect.objectContaining({ id: a.id })],
      kind: 'trash',
    })
    expect(progress()).toBe('1 of 4')
    expect(
      screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled'),
    ).toBe(true)

    await act(async () => {
      key('Enter')
    })
    await act(async () => {
      key('u')
    })
    expect(calls.revert).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'moveTo' }),
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Sorted/ }))
    })
    await act(async () => {
      key('u')
    })
    expect(calls.revert).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'done' }),
    )
    await act(async () => {
      key('s')
    })
    await act(async () => {
      key('u')
    })
    expect(calls.star).toHaveBeenCalledTimes(2)
  })

  it('Undo of a new stop hands the created stop to the revert', async () => {
    const { calls } = setup({ items: [d, a], tree: null })
    await act(async () => {
      key('Enter')
    })
    await act(async () => {
      key('u')
    })
    expect(calls.revert).toHaveBeenCalledWith(
      expect.objectContaining({
        createdMomentId: 'created-stop',
        kind: 'newStop',
      }),
    )
  })

  it('a failed save takes the step back', async () => {
    setup({ fail: 'trash' })
    await act(async () => {
      key('x')
    })
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '0',
    )
    expect(
      screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('keeps a stable session list: sorted items do not jump the position', async () => {
    setup()
    await act(async () => {
      key('x')
    })
    await act(async () => {
      key('ArrowRight')
    })
    expect(progress()).toBe('3 of 4')
    await act(async () => {
      key('ArrowLeft')
    })
    // The trashed first photo is skipped, not renumbered.
    expect(progress()).toBe('2 of 4')
    await act(async () => {
      key('ArrowLeft')
    })
    expect(progress()).toBe('2 of 4')
  })

  it('swipes: up and right star, left skips, trashing is by button', async () => {
    const { calls } = setup()
    const stage = screen.getByTestId('quick-sort-stage')
    const swipe = async (dx: number, dy: number) => {
      fireEvent.touchStart(stage, { touches: [{ clientX: 200, clientY: 300 }] })
      await act(async () => {
        fireEvent.touchEnd(stage, {
          changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }],
        })
      })
    }
    await swipe(10, -10)
    expect(calls.trash).not.toHaveBeenCalled()
    await swipe(120, 5)
    expect(calls.star).toHaveBeenCalledTimes(1)
    await swipe(-120, 5)
    expect(progress()).toBe('2 of 4')
    await swipe(5, -120)
    expect(calls.star).toHaveBeenCalledTimes(2)
    expect(calls.trash).not.toHaveBeenCalled()
  })

  it('Escape finishes at once without steps, asks (summary) with steps', async () => {
    const { onClose } = setup()
    await act(async () => {
      key('x')
    })
    await act(async () => {
      key('Escape')
    })
    expect(screen.getByRole('dialog', { name: 'Sorting done' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => {
      key('Escape')
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape without steps closes directly', () => {
    const { onClose } = setup()
    key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  describe('series', () => {
    it('shows the chip and G opens it; keep one trashes the others', async () => {
      const { calls } = setup({ items: [b, c, d] })
      const chip = screen.getByRole('button', { name: /Series: 2 similar/ })
      expect(chip).toBeTruthy()
      await act(async () => {
        key('g')
      })
      const dialog = screen.getByRole('dialog', { name: 'Pick the best one' })
      // c is far sharper relative to b, so it is recommended.
      expect(within(dialog).getByText('Recommended')).toBeTruthy()
      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: /Keep this one, trash the other 1/,
          }),
        )
      })
      expect(calls.trash).toHaveBeenCalledWith([
        expect.objectContaining({ id: b.id }),
      ])
      expect(progress()).toBe('2 of 3')
      expect(
        screen.queryByRole('dialog', { name: 'Pick the best one' }),
      ).toBeNull()
      // Undo through the same stack.
      await act(async () => {
        key('u')
      })
      expect(calls.revert).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'trash' }),
      )
    })

    it('has no series and ignores G without phash', () => {
      setup({
        items: [a, med(5, { capturedAt: '2026-01-02T09:00:05+00:00' })],
      })
      expect(screen.queryByRole('button', { name: /Series/ })).toBeNull()
      key('g')
      expect(screen.queryByTestId('series-view')).toBeNull()
    })
  })

  describe('summary', () => {
    it('opens when everything is handled, counts, links the day and closes', async () => {
      const { onClose } = setup({ items: [a, b] })
      await act(async () => {
        key('s')
      })
      await act(async () => {
        key('Enter')
      })
      await act(async () => {
        key('x')
      })
      const dialog = screen.getByRole('dialog', { name: 'Day done' })
      const stat = (label: string) =>
        within(dialog).getByText(label).previousElementSibling?.textContent
      expect(stat('Best')).toBe('1')
      expect(stat('In the trash')).toBe('1')
      expect(stat('To stops')).toBe('1')
      expect(stat('Sorted')).toBe('0')
      expect(within(dialog).getByText(/Sorting time: \d+:\d\d/)).toBeTruthy()
      const link = within(dialog).getByRole('link', {
        name: 'Write the day note',
      })
      expect(link.getAttribute('href')).toBe('/j/j1/workspace/day/2026-01-02')
      expect(
        within(dialog).queryByRole('button', { name: 'Next day' }),
      ).toBeNull()
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Back to sorting' }),
      )
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('continues with the next day that still has unsorted items', async () => {
      setup({ items: [a, d] })
      await act(async () => {
        key('x')
      })
      await act(async () => {
        key('Escape')
      })
      const dialog = screen.getByRole('dialog', { name: 'Day done' })
      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'Next day' }),
        )
      })
      expect(screen.queryByRole('dialog', { name: 'Day done' })).toBeNull()
      expect(progress()).toBe('2 of 2')
    })

    it('a single trashed photo ends the session with the summary', async () => {
      setup({ items: [a] })
      await act(async () => {
        key('x')
      })
      expect(screen.getByTestId('quick-sort-summary')).toBeTruthy()
      expect(screen.getByRole('dialog', { name: 'Day done' })).toBeTruthy()
    })
  })

  it('shows facts and shortcuts in the desktop panel', () => {
    setup({
      items: [med(7, { latitude: 50.0875, longitude: 14.4214 })],
    })
    expect(
      screen.getByText('50.0875, 14.4214', { selector: 'dd' }),
    ).toBeTruthy()
    expect(screen.getByText('Europe/Prague')).toBeTruthy()
    expect(screen.getByText('Enter: accept suggestion')).toBeTruthy()
  })

  describe('compare and zoom', () => {
    const withImage = (item: MediaItem): MediaItem => ({
      ...item,
      variants: [variant(item.id, 'large')],
    })
    const photos = [a, b, c, d].map(withImage)
    const stageImages = () => [
      ...screen.getByTestId('quick-sort-stage').querySelectorAll('img'),
    ]
    const panes = () => screen.queryAllByTestId('compare-pane')

    it('compares two photos of the series and zooms both together', async () => {
      setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      expect(panes()).toHaveLength(1)
      const toggle = screen.getByRole('button', { name: 'Compare' })
      key('c')
      expect(toggle.getAttribute('aria-pressed')).toBe('true')
      expect(panes()).toHaveLength(2)
      // Partner is the other photo of the series, labelled with its caption.
      expect(panes().map((pane) => pane.getAttribute('data-photo-id'))).toEqual(
        [b.id, c.id],
      )
      expect(
        stageImages().filter((img) => img.hasAttribute('src')),
      ).toHaveLength(2)
      const zoom = screen.getByRole('button', { name: 'Zoom' })
      key('z')
      expect(zoom.getAttribute('aria-pressed')).toBe('true')
      // Zoom does not hide the compared photo: both panes are zoomed.
      expect(panes()).toHaveLength(2)
      expect(panes().map((pane) => pane.getAttribute('data-zoom'))).toEqual([
        '2.000',
        '2.000',
      ])
      expect(screen.getAllByTestId('compare-caption')).toHaveLength(2)
    })

    it('Esc leaves zoom first, then compare, then the view', async () => {
      setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      key('c')
      key('z')
      key('Escape')
      expect(panes().map((pane) => pane.getAttribute('data-zoom'))).toEqual([
        '1.000',
        '1.000',
      ])
      expect(panes()).toHaveLength(2)
      key('Escape')
      expect(panes()).toHaveLength(1)
      expect(screen.queryByTestId('quick-sort-summary')).toBeNull()
      expect(screen.getByRole('dialog', { name: 'Quick sort' })).toBeTruthy()
    })

    it('zoom resets when moving to another photo', async () => {
      setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      key('z')
      expect(panes()[0]?.getAttribute('data-zoom')).toBe('2.000')
      await act(async () => {
        key('ArrowRight')
      })
      expect(panes()[0]?.getAttribute('data-zoom')).toBe('1.000')
    })

    it('Tab swaps A and B; [ and ] pick the partner; controls are real buttons', async () => {
      setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      key('c')
      key('Tab')
      expect(panes().map((pane) => pane.getAttribute('data-photo-id'))).toEqual(
        [c.id, b.id],
      )
      expect(
        screen.getByRole('button', { name: 'Previous photo to compare' }),
      ).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Swap A and B' })).toBeTruthy()
    })

    it('Trash, Keep and star act on B as well as on A', async () => {
      const { calls } = setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      key('c')
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Mark photo B as best' }),
        )
      })
      expect(calls.star).toHaveBeenCalledWith([
        expect.objectContaining({ id: c.id }),
      ])
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Keep photo B' }))
      })
      expect(calls.done).toHaveBeenCalledWith([
        expect.objectContaining({ id: c.id }),
      ])
      // Acting on B does not move away from A.
      expect(progress()).toBe('2 of 4')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Trash photo A' }))
      })
      expect(calls.trash).toHaveBeenCalledWith([
        expect.objectContaining({ id: b.id }),
      ])
    })

    it('Tab does not swap while focus is on a control; Keep on B still allows star', async () => {
      const { calls } = setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      key('c')
      const ids = () =>
        panes().map((pane) => pane.getAttribute('data-photo-id'))
      key('Tab', screen.getByRole('button', { name: 'Swap A and B' }))
      expect(ids()).toEqual([b.id, c.id])
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Keep photo B' }))
      })
      expect(
        screen
          .getByRole('button', { name: 'Keep photo B' })
          .hasAttribute('disabled'),
      ).toBe(true)
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Mark photo B as best' }),
        )
      })
      expect(calls.star).toHaveBeenCalledTimes(1)
    })

    it('A -> B -> A does not restore the old zoom or swap', async () => {
      setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      key('c')
      key('Tab')
      key('z')
      await act(async () => {
        key('ArrowRight')
      })
      await act(async () => {
        key('ArrowLeft')
      })
      expect(panes()[0]?.getAttribute('data-zoom')).toBe('1.000')
      expect(panes()[0]?.getAttribute('data-photo-id')).toBe(b.id)
    })

    it('held C / Z keys do not repeat', async () => {
      setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      fireEvent.keyDown(document.body, { key: 'z', repeat: true })
      expect(panes()[0]?.getAttribute('data-zoom')).toBe('1.000')
    })

    it('never pairs with a trashed photo', async () => {
      const { calls } = setup({ items: photos })
      await act(async () => {
        key('ArrowRight')
      })
      key('c')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Trash photo B' }))
      })
      expect(calls.trash).toHaveBeenCalledWith([
        expect.objectContaining({ id: c.id }),
      ])
      expect(progress()).toBe('2 of 4')
      // c is trashed: the series has no other partner left.
      expect(panes()).toHaveLength(1)
    })

    it('shows the controls without a keyboard (touch)', () => {
      setup({ items: photos })
      expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Zoom' })).toBeTruthy()
    })
  })
})
