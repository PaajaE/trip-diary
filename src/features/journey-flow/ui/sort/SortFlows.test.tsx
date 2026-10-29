import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { ID, lakeSeries } from '@/features/journey-flow/test-fixtures'
import {
  click,
  key,
  openStop,
  setup,
} from '@/features/journey-flow/ui/sort/sort-test-setup'

vi.mock('@/shared/lib/haptics', () => ({ haptic: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
    ...rest
  }: {
    children: ReactNode
    params: Record<string, string>
    to: string
  }) => (
    <a
      {...rest}
      href={to
        .replace('$journeyId', params.journeyId ?? '')
        .replace('$date', params.date ?? '')
        .replace('$dayKey', params.dayKey ?? '')}
    >
      {children}
    </a>
  ),
}))

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('cs')
})
afterEach(cleanup)

const swipeOn = async (node: Element, dx: number, dy: number) => {
  fireEvent.touchStart(node, { touches: [{ clientX: 200, clientY: 300 }] })
  await act(async () => {
    fireEvent.touchEnd(node, {
      changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }],
    })
  })
}

describe('Série', () => {
  it('pre-selects the recommended, then keeps it and trashes the rest in one go', async () => {
    const { actions, idsOf } = setup({ mutate: lakeSeries })
    const lake = idsOf(ID.lake)
    await openStop(3)
    await click('Podobné: 4')
    const dialog = screen.getByRole('dialog', { name: 'Podobné fotky · 4' })
    const toggles = within(dialog).getAllByTestId('series-toggle')
    // Photo 2 is the sharpest: recommended and kept.
    expect(toggles.map((t) => t.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ])
    expect(within(dialog).getByText(/doporučená/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', {
          name: 'Nechat doporučenou, ostatní do koše',
        }),
      )
    })
    expect(actions.trashPhotos).toHaveBeenCalledWith([
      lake[0],
      lake[2],
      lake[3],
    ])
    expect(actions.sortPhotos).toHaveBeenCalledWith([lake[1]])
    expect(screen.queryByRole('dialog', { name: /Podobné fotky/ })).toBeNull()
  })

  it('says how many it keeps after a flip: "Nechávám 2 ze 4, zbylé 2 půjdou do koše"', async () => {
    const { actions, idsOf } = setup({ mutate: lakeSeries })
    const lake = idsOf(ID.lake)
    await openStop(3)
    await click('Podobné: 4')
    const dialog = screen.getByRole('dialog', { name: 'Podobné fotky · 4' })
    fireEvent.click(within(dialog).getAllByTestId('series-toggle')[3] ?? dialog)
    const bulk = within(dialog).getByRole('button', {
      name: 'Nechávám 2 ze 4, zbylé 2 půjdou do koše',
    })
    await act(async () => {
      fireEvent.click(bulk)
    })
    expect(actions.trashPhotos).toHaveBeenCalledWith([lake[0], lake[2]])
    expect(actions.sortPhotos).toHaveBeenCalledWith([lake[1], lake[3]])
  })

  it('Esc leaves the series without writing anything', async () => {
    const { actions } = setup({ mutate: lakeSeries })
    await openStop(3)
    await click('Podobné: 4')
    await key('Escape')
    expect(screen.queryByRole('dialog', { name: /Podobné fotky/ })).toBeNull()
    expect(actions.trashPhotos).not.toHaveBeenCalled()
  })
})

describe('Porovnání', () => {
  it('the kept photo stays; challengers by swipe, swipe up trashes that one', async () => {
    const { actions, idsOf } = setup({ mutate: lakeSeries })
    const lake = idsOf(ID.lake)
    await openStop(3)
    await click(/^Porovnat/)
    const duel = screen.getByRole('dialog', { name: 'Porovnání' })
    expect(
      within(duel).getByText('Ponechaná zůstává, vyzyvatel 1 z 3'),
    ).toBeInTheDocument()
    const panes = () => within(duel).getAllByTestId('duel-pane')
    expect(panes().map((p) => p.dataset.role)).toEqual(['winner', 'challenger'])
    // Swipe sideways: the next challenger, the kept one stays.
    await swipeOn(panes()[1]?.querySelector('figure') ?? duel, -120, 0)
    expect(
      within(duel).getByText('Ponechaná zůstává, vyzyvatel 2 z 3'),
    ).toBeInTheDocument()
    expect(panes()[0]?.querySelector('figure')?.dataset.photoId).toBe(lake[0])
    // Swipe up on the challenger: that photo goes to the trash.
    await swipeOn(panes()[1]?.querySelector('figure') ?? duel, 0, -120)
    expect(actions.trashPhotos).toHaveBeenCalledWith([lake[2]])
    expect(panes()[0]?.querySelector('figure')?.dataset.photoId).toBe(lake[0])
  })

  it('"Nechat tuhle" under the challenger keeps it and makes it the one that stays', async () => {
    const { actions, idsOf } = setup({ mutate: lakeSeries })
    const lake = idsOf(ID.lake)
    await openStop(3)
    await click(/^Porovnat/)
    const duel = screen.getByRole('dialog', { name: 'Porovnání' })
    await act(async () => {
      fireEvent.click(
        within(duel).getByRole('button', { name: 'Nechat tuhle, vyzyvatel' }),
      )
    })
    expect(actions.sortPhotos).toHaveBeenCalledWith([lake[1]])
    const winner = within(duel)
      .getAllByTestId('duel-pane')
      .find((p) => p.dataset.role === 'winner')
    expect(winner?.querySelector('figure')?.dataset.photoId).toBe(lake[1])
    expect(
      within(duel).getByRole('list', { name: 'Kandidáti' }),
    ).toBeInTheDocument()
  })

  it('zooms both photos together with Celá · 100 % · 200 %, Esc leaves zoom first', async () => {
    setup({ mutate: lakeSeries })
    await openStop(3)
    await click(/^Porovnat/)
    const duel = screen.getByRole('dialog', { name: 'Porovnání' })
    const zoom = within(duel).getByRole('group', { name: 'Přiblížení' })
    expect(within(zoom).getByRole('button', { name: 'Celá' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      within(zoom).getByRole('button', { name: '100 %' }),
    ).toBeInTheDocument()
    expect(
      within(zoom).getByRole('button', { name: '200 %' }),
    ).toBeInTheDocument()
    await key('Escape')
    expect(screen.queryByRole('dialog', { name: 'Porovnání' })).toBeNull()
  })

  it('full screen compare hides the chrome until a tap', async () => {
    vi.useFakeTimers()
    try {
      setup({ mutate: lakeSeries })
      await openStop(3)
      await click(/^Porovnat/)
      const duel = screen.getByRole('dialog', { name: 'Porovnání' })
      await act(async () => {
        fireEvent.click(
          within(duel).getByRole('button', {
            name: 'Celá obrazovka, bez rušení (F)',
          }),
        )
      })
      expect(within(duel).queryByRole('list', { name: 'Kandidáti' })).toBeNull()
      expect(
        within(duel).queryByRole('button', { name: /Nechat tuhle/ }),
      ).toBeNull()
      const figure =
        within(duel).getAllByTestId('duel-pane')[0]?.querySelector('figure') ??
        duel
      fireEvent.touchStart(figure, { touches: [{ clientX: 50, clientY: 50 }] })
      fireEvent.touchEnd(figure, {
        changedTouches: [{ clientX: 50, clientY: 50 }],
      })
      await act(async () => {
        vi.advanceTimersByTime(400)
      })
      expect(
        within(duel).getByText('Klepni pro ovládání · tah do strany = další'),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Konec dne', () => {
  const allSorted = (media: Parameters<typeof lakeSeries>[0]) => {
    for (const item of media) item.reviewedAt = '2026-06-06T08:00:00+00:00'
    const first = media.find((item) => item.momentId === ID.lake)
    if (first !== undefined) first.starred = true
  }

  it('says the stops are done but not the day while photos have no stop', async () => {
    const { onOpenReview } = setup({ mutate: allSorted })
    const end = screen.getByTestId('day-end')
    expect(
      within(end).getByRole('heading', { name: 'Zastávky dne jsou hotové' }),
    ).toBeInTheDocument()
    expect(
      within(end).getByText('Ještě 2 fotky nemají zastávku.'),
    ).toBeInTheDocument()
    fireEvent.click(within(end).getByRole('button', { name: 'Nevím kam · 2' }))
    expect(onOpenReview).toHaveBeenCalledTimes(1)
  })

  it('sums up the day with links to the note, back to sorting and Příjem', async () => {
    setup({
      mutate: (media) => {
        allSorted(media)
        // Place the two photos without a stop: nothing is left over.
        for (const item of media) {
          if (item.momentId === null && item.capturedAt !== null)
            item.momentId = ID.lake
        }
      },
    })
    const end = screen.getByTestId('day-end')
    expect(
      within(end).getByRole('heading', { name: 'Den je hotový' }),
    ).toBeInTheDocument()
    expect(
      within(end).getByText(/· zastávky 4 z 4 hotovo$/),
    ).toBeInTheDocument()
    expect(within(end).getByText('Zastávky 4 z 4 hotovo')).toBeInTheDocument()
    expect(within(end).getByText('1 ★')).toBeInTheDocument()
    expect(within(end).getByText('0 koš')).toBeInTheDocument()
    expect(
      within(end).getByRole('link', { name: 'Napsat zápis dne' }),
    ).toHaveAttribute('href', '/j/j1/workspace/day/2026-06-05')
    expect(
      within(end).getByRole('link', { name: 'Zpět na příjem' }),
    ).toHaveAttribute('href', '/j/j1/flow')
    // The only day of the journey: no "Další den".
    expect(within(end).getByText('Poslední den cesty')).toBeInTheDocument()
    fireEvent.click(within(end).getByRole('button', { name: 'Později' }))
    expect(
      within(end).queryByRole('link', { name: 'Napsat zápis dne' }),
    ).toBeNull()
    await click('Zpět na třídění')
    expect(screen.queryByTestId('day-end')).toBeNull()
    expect(screen.getByTestId('sort-stage')).toBeInTheDocument()
    await click('Konec dne')
    expect(screen.getByTestId('day-end')).toBeInTheDocument()
  })

  it('opens by itself after the last decision and counts the trash of the session', async () => {
    const { actions } = setup({
      mutate: (media) => {
        for (const item of media) {
          if (item.momentId !== ID.viewpoint)
            item.reviewedAt = '2026-06-06T08:00:00+00:00'
        }
      },
    })
    await click(/^Koš/)
    expect(actions.trashPhotos).toHaveBeenCalledTimes(1)
    const end = screen.getByTestId('day-end')
    expect(within(end).getByText('1 koš')).toBeInTheDocument()
  })
})
