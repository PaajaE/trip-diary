import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { ID, lakeSeries } from '@/features/journey-flow/test-fixtures'
import {
  click,
  FULLSCREEN,
  key,
  openStop,
  position,
  setup,
  UNDO,
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

describe('SortScreen (Třídění, krok 2 ze 2)', () => {
  it('shows one photo of the first open stop, the stops strip and the three decisions', () => {
    setup()
    expect(
      screen.getByRole('dialog', { name: /Krok 2 ze 2 · Třídění fotek/ }),
    ).toBeInTheDocument()
    // The hotel is sorted already: the ride (stop 2) is the first open one.
    expect(screen.getByTestId('sort-stop-toggle')).toHaveAccessibleName(
      /^Zastávka 2 .*1 z 5 hotovo/,
    )
    expect(position()).toMatch(/· 1 z 3$/)
    for (const name of ['Koš', 'Nechat', '★ Nejlepší']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^${name}`) }),
      ).toBeEnabled()
    }
    expect(
      screen.getByText(/★ označí fotku jako výběr pro obálku dne/),
    ).toBeInTheDocument()
    const strip = screen.getByRole('list', { name: 'Fotky zastávky' })
    expect(within(strip).getAllByRole('button')).toHaveLength(3)
  })

  it('keep, trash and ★ advance automatically; finishing a stop confirms it', async () => {
    const { actions, idsOf } = setup()
    const ride = idsOf(ID.ride)
    await click(/^Nechat/)
    expect(actions.sortPhotos).toHaveBeenLastCalledWith([ride[0]])
    expect(position()).toMatch(/· 2 z 3$/)
    await click(/^Koš/)
    expect(actions.trashPhotos).toHaveBeenLastCalledWith([ride[1]])
    // Trash never marks the photo as sorted.
    expect(actions.sortPhotos).toHaveBeenCalledTimes(1)
    await click(/^★ Nejlepší/)
    expect(actions.starPhotos).toHaveBeenCalledWith([ride[2]], true)
    expect(actions.sortPhotos).toHaveBeenLastCalledWith([ride[2]])
    // The ride is done: on to stop 3 and the stop is confirmed (locked).
    expect(screen.getByRole('status')).toHaveTextContent('Zastávka 2 hotová')
    expect(position()).toMatch(/· 1 z 1$/)
    await vi.waitFor(() => {
      expect(actions.finishStop).toHaveBeenCalled()
    })
    const [stop] = actions.finishStop.mock.calls[0] ?? []
    expect(stop?.stop.id).toBe(ID.ride)
    expect(await actions.finishStop.mock.results[0]?.value).toBe(ID.ride)
  })

  it('Zpět really reverts: trash comes back from the trash, keep waits again', async () => {
    const { actions, idsOf } = setup()
    const ride = idsOf(ID.ride)
    expect(screen.getByRole('button', { name: UNDO })).toBeDisabled()
    await click(/^Koš/)
    await click(UNDO)
    expect(actions.restorePhotos).toHaveBeenCalledWith([ride[0]])
    expect(position()).toMatch(/· 1 z 3$/)
    await click(/^Nechat/)
    await key('z')
    expect(actions.sortPhotos).toHaveBeenLastCalledWith([ride[0]], false)
  })

  it('a failed write takes the step back and says so', async () => {
    const { actions } = setup()
    actions.trashPhotos.mockRejectedValueOnce(new Error('x'))
    await click(/^Koš/)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Změna se nepovedla',
    )
    const strip = screen.getByRole('list', { name: 'Fotky zastávky' })
    expect(within(strip).getAllByRole('button')[0]).toHaveAttribute(
      'data-state',
      'open',
    )
  })

  it('shows a suggested-trash photo faded with its reason, never deleting it', async () => {
    const { actions } = setup({ mutate: lakeSeries })
    await openStop(4)
    expect(position()).toMatch(/· 1 z 4$/)
    expect(screen.getByTestId('sort-trash-hint')).toHaveTextContent(
      'Návrh do koše: Rozmazaná proti ostatním ze série',
    )
    expect(screen.getByTestId('sort-trash-fade')).toBeInTheDocument()
    const strip = screen.getByRole('list', { name: 'Fotky zastávky' })
    expect(within(strip).getAllByRole('button')[0]).toHaveAccessibleName(
      /návrh do koše: Rozmazaná/,
    )
    expect(actions.trashPhotos).not.toHaveBeenCalled()
  })

  it('swipe up trashes, sideways moves without deciding', async () => {
    const { actions, idsOf } = setup()
    const stage = screen.getByTestId('sort-stage')
    const swipe = async (dx: number, dy: number) => {
      fireEvent.touchStart(stage, { touches: [{ clientX: 200, clientY: 300 }] })
      await act(async () => {
        fireEvent.touchEnd(stage, {
          changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }],
        })
      })
    }
    await swipe(-120, 4)
    expect(position()).toMatch(/· 2 z 3$/)
    await swipe(4, -120)
    expect(actions.trashPhotos).toHaveBeenCalledWith([idsOf(ID.ride)[1]])
  })

  it('keyboard: K, N, S, arrows; ignored in a text field', async () => {
    const { actions, idsOf } = setup()
    const ride = idsOf(ID.ride)
    const input = document.createElement('input')
    document.body.append(input)
    await key('n', input)
    expect(actions.sortPhotos).not.toHaveBeenCalled()
    input.remove()
    await key('n')
    expect(actions.sortPhotos).toHaveBeenLastCalledWith([ride[0]])
    await key('k')
    expect(actions.trashPhotos).toHaveBeenLastCalledWith([ride[1]])
    await key('s')
    expect(actions.starPhotos).toHaveBeenLastCalledWith([ride[2]], true)
    await key('ArrowLeft')
    expect(screen.getByTestId('sort-stage')).toBeInTheDocument()
  })

  it('lists the shortcuts and gives every action a key hint', () => {
    setup()
    const hint = screen.getAllByRole('list', { name: 'Klávesové zkratky' })[0]
    if (hint === undefined) throw new Error('no hint')
    for (const text of [
      'koš',
      'nechat',
      'porovnat',
      'zpět',
      'přesunout',
      'bez rušení',
      'prohodit strany v porovnání',
    ]) {
      expect(within(hint).getByText(text)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /^Koš/ })).toHaveTextContent('K')
  })

  it('full screen "bez rušení": chrome away, the time stays, F and Esc', async () => {
    setup()
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: FULLSCREEN })[0] ?? document.body,
      )
    })
    expect(screen.queryByTestId('sort-stop-toggle')).toBeNull()
    expect(screen.queryByTestId('sort-filmstrip')).toBeNull()
    expect(position()).toMatch(/\d:\d\d · 1 z 3$/)
    expect(
      screen.getByText('Klepnutím schováš ovládání · tah nahoru = Koš'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '★ Nejlepší' }),
    ).toBeInTheDocument()
    await key('Escape')
    expect(screen.getByTestId('sort-stop-toggle')).toBeInTheDocument()
    await key('f')
    expect(screen.queryByTestId('sort-stop-toggle')).toBeNull()
    await key('F')
    expect(screen.getByTestId('sort-filmstrip')).toBeInTheDocument()
  })

  it('a tap in full screen hides the controls, another shows them', async () => {
    vi.useFakeTimers()
    try {
      setup()
      await act(async () => {
        fireEvent.click(
          screen.getAllByRole('button', { name: FULLSCREEN })[0] ??
            document.body,
        )
      })
      const stage = screen.getByTestId('sort-stage')
      const tap = async () => {
        fireEvent.touchStart(stage, {
          touches: [{ clientX: 100, clientY: 100 }],
        })
        fireEvent.touchEnd(stage, {
          changedTouches: [{ clientX: 100, clientY: 100 }],
        })
        await act(async () => {
          vi.advanceTimersByTime(400)
        })
      }
      await tap()
      expect(screen.queryByRole('button', { name: /^Koš/ })).toBeNull()
      await tap()
      expect(screen.getByRole('button', { name: /^Koš/ })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cuts before the photo and merges with the previous stop from the stop panel', async () => {
    const { actions, day } = setup()
    await openStop(4)
    fireEvent.click(screen.getByTestId('sort-stop-toggle'))
    const panel = () => screen.getByTestId('sort-stop-panel')
    // The first photo cannot start a new stop.
    expect(
      within(panel()).getByRole('button', { name: 'Řez před touto fotkou' }),
    ).toBeDisabled()
    fireEvent.click(screen.getByTestId('sort-stop-toggle'))
    await key('ArrowRight')
    fireEvent.click(screen.getByTestId('sort-stop-toggle'))
    await act(async () => {
      fireEvent.click(
        within(panel()).getByRole('button', { name: 'Řez před touto fotkou' }),
      )
    })
    const lake = day.stops.find((s) => s.id === ID.lake)
    expect(actions.splitStop).toHaveBeenCalledWith(
      ID.lake,
      lake?.media[1]?.capturedAt,
    )
    await act(async () => {
      fireEvent.click(
        within(panel()).getByRole('button', { name: 'Sloučit s předchozí' }),
      )
    })
    expect(actions.mergeWithPrevious).toHaveBeenCalledWith(
      ID.viewpoint,
      ID.lake,
    )
  })

  it('Přesunout opens "Přesunout do"; "Nová zastávka" makes a stop of the photo', async () => {
    const { actions, idsOf } = setup()
    await click(/^Přesunout/)
    const sheet = screen.getByRole('dialog', { name: /^Přesunout/ })
    await act(async () => {
      fireEvent.click(
        within(sheet).getByRole('button', { name: /^Nová zastávka z výběru/ }),
      )
    })
    expect(actions.createStopFromPhotos).toHaveBeenCalledWith([
      idsOf(ID.ride)[0],
    ])
    // On to the next photo of the stop.
    expect(position()).toMatch(/· 2 z 3$/)
  })

  it('"Nevím kam" leads to the check of the day', async () => {
    const { onOpenReview } = setup()
    fireEvent.click(screen.getByTestId('sort-stop-toggle'))
    await click('Nevím kam · 2')
    expect(onOpenReview).toHaveBeenCalledTimes(1)
  })

  describe('on a phone (390 px, touch only)', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 390,
      })
    })

    it('reaches every action by tapping, each target at least 44 px', () => {
      setup()
      const names = [
        UNDO,
        /^Porovnat/,
        /^Zoom/,
        /^Přesunout/,
        /^Koš/,
        /^Nechat/,
        /^★ Nejlepší/,
        'Celá obrazovka, bez rušení (F)',
        'Zpět na kontrolu zastávek',
      ]
      for (const name of names) {
        const button = screen.getAllByRole('button', { name })[0]
        expect(button?.className).toMatch(/min-h-1[1-6]|size-11/)
      }
      const strip = screen.getByRole('list', { name: 'Fotky zastávky' })
      for (const thumb of within(strip).getAllByRole('button')) {
        expect(thumb.className).toMatch(/size-11/)
      }
      expect(screen.getByTestId('sort-stop-toggle').className).toMatch(
        /min-h-11/,
      )
    })
  })
})
