/**
 * Regressions of the ZS-7c review: series never trashes kept or ★ photos,
 * series Undo is local, full screen controls on touch, Undo that does not
 * wait for a save, the stop lock taken back, and the a11y details.
 */
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
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('cs')
})
afterEach(cleanup)

const series = () => screen.getByRole('dialog', { name: 'Podobné fotky · 4' })
const bulk = () =>
  within(series()).getByRole('button', { name: /^(Nechávám|Nechat)/ })
const flush = () =>
  act(async () => {
    await Promise.resolve()
  })

describe('Série never trashes what is kept or ★ (M1)', () => {
  it('A: a photo kept before stays kept', async () => {
    const { actions, idsOf } = setup({
      mutate: (media) => {
        lakeSeries(media)
        const third = media.filter((m) => m.momentId === ID.lake)[2]
        if (third !== undefined) third.reviewedAt = '2026-06-06T08:00:00+00:00'
      },
    })
    const lake = idsOf(ID.lake)
    await openStop(3)
    await click('Podobné: 4')
    const toggles = within(series()).getAllByTestId('series-toggle')
    expect(toggles[2]).toHaveAttribute('aria-pressed', 'true')
    await act(async () => {
      fireEvent.click(bulk())
    })
    expect(actions.trashPhotos).toHaveBeenCalledWith([lake[0], lake[3]])
  })

  it('B: ★ on the challenger in the series compare keeps it', async () => {
    const { actions, idsOf } = setup({ mutate: lakeSeries })
    const lake = idsOf(ID.lake)
    await openStop(3)
    await click('Podobné: 4')
    await act(async () => {
      fireEvent.click(
        within(series()).getByRole('button', { name: 'Porovnat 2 vybrané' }),
      )
    })
    const duel = screen.getByRole('dialog', { name: 'Porovnání' })
    await act(async () => {
      fireEvent.click(
        within(duel).getByRole('button', { name: 'Nejlepší, vyzyvatel' }),
      )
    })
    expect(actions.starPhotos).toHaveBeenCalledWith([lake[0]], true)
    await key('Escape')
    await act(async () => {
      fireEvent.click(bulk())
    })
    const trashed = actions.trashPhotos.mock.calls.flatMap(([ids]) => ids)
    expect(trashed).not.toContain(lake[0])
    expect(trashed).toEqual([lake[2], lake[3]])
  })

  it('C: a ★ still saving counts; the photo cannot be flipped to the trash', async () => {
    const { actions, idsOf } = setup({ mutate: lakeSeries })
    const lake = idsOf(ID.lake)
    actions.starPhotos.mockImplementation(() => new Promise(() => undefined))
    await openStop(3)
    // ★ Nejlepší on the first (blurry) photo, never saved before the series.
    await click(/^★ Nejlepší/)
    await key('ArrowLeft')
    await click('Podobné: 4')
    const first = within(series()).getAllByTestId('series-toggle')[0]
    expect(first).toBeDisabled()
    expect(first).toHaveAccessibleName('★ fotka zůstává')
    await act(async () => {
      fireEvent.click(bulk())
    })
    expect(
      actions.trashPhotos.mock.calls.flatMap(([ids]) => ids),
    ).not.toContain(lake[0])
  })

  it('Koš on a ★ photo takes the ★ off in the same step; Zpět puts both back', async () => {
    const { actions, idsOf } = setup({
      mutate: (media) => {
        const first = media.find((m) => m.momentId === ID.ride)
        if (first !== undefined) first.starred = true
      },
    })
    const ride = idsOf(ID.ride)
    await click(/^Koš/)
    await flush()
    expect(actions.starPhotos).toHaveBeenCalledWith([ride[0]], false)
    expect(actions.trashPhotos).toHaveBeenCalledWith([ride[0]])
    await click(UNDO)
    await flush()
    expect(actions.restorePhotos).toHaveBeenCalledWith([ride[0]])
    expect(actions.starPhotos).toHaveBeenLastCalledWith([ride[0]], true)
  })
})

describe('Série Undo is local (M2)', () => {
  it('undoes the series step only, never an earlier step of another stop', async () => {
    const { actions } = setup({ mutate: lakeSeries })
    await click(/^Nechat/) // a written step on the ride
    await openStop(3)
    await click('Podobné: 4')
    const undo = within(series()).getByRole('button', { name: 'Zpět' })
    expect(undo).toBeDisabled()
    const toggles = () => within(series()).getAllByTestId('series-toggle')
    fireEvent.click(toggles()[3] ?? series())
    expect(toggles()[3]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(undo)
    expect(toggles()[3]).toHaveAttribute('aria-pressed', 'false')
    await key('z')
    await flush()
    expect(actions.sortPhotos).not.toHaveBeenCalledWith(
      expect.anything(),
      false,
    )
  })

  it('N, K, S and Z work on the focused photo of the grid', async () => {
    const { actions, idsOf } = setup({ mutate: lakeSeries })
    const lake = idsOf(ID.lake)
    await openStop(3)
    await click('Podobné: 4')
    const toggles = () => within(series()).getAllByTestId('series-toggle')
    // Focus: the second pick (photo 1). N keeps it, Z takes it back.
    await key('n')
    expect(toggles()[0]).toHaveAttribute('aria-pressed', 'true')
    await key('k')
    expect(toggles()[0]).toHaveAttribute('aria-pressed', 'false')
    await key('s')
    expect(actions.starPhotos).toHaveBeenCalledWith([lake[0]], true)
    await key('z')
    expect(actions.starPhotos).toHaveBeenLastCalledWith([lake[0]], false)
  })
})

describe('Undo does not wait for a save (M4)', () => {
  it('is available at once and reverts once the write is saved', async () => {
    const { actions, idsOf } = setup()
    const ride = idsOf(ID.ride)
    let resolve: (n: number) => void = () => undefined
    actions.sortPhotos.mockImplementationOnce(
      () =>
        new Promise<number>((done) => {
          resolve = done
        }),
    )
    await click(/^Nechat/)
    expect(screen.getByRole('button', { name: UNDO })).toBeEnabled()
    await click(UNDO)
    expect(position()).toMatch(/· 1 z 3$/)
    expect(actions.sortPhotos).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve(1)
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(actions.sortPhotos).toHaveBeenLastCalledWith([ride[0]], false)
    })
  })

  it('a write that failed after its Undo needs no revert and shows no error', async () => {
    const { actions } = setup()
    let reject: (e: Error) => void = () => undefined
    actions.trashPhotos.mockImplementationOnce(
      () =>
        new Promise<number>((_, fail) => {
          reject = fail
        }),
    )
    await click(/^Koš/)
    await click(UNDO)
    await act(async () => {
      reject(new Error('x'))
      await Promise.resolve()
    })
    expect(actions.restorePhotos).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Zpět after the last decision of a stop unlocks it again (item 4)', async () => {
    const { actions } = setup()
    for (let i = 0; i < 3; i += 1) await click(/^Nechat/) // the ride
    await click(/^Nechat/) // the viewpoint, its only photo
    await vi.waitFor(() => {
      expect(actions.finishStop).toHaveBeenCalledTimes(2)
    })
    await flush()
    await click(UNDO)
    await vi.waitFor(() => {
      expect(actions.unconfirmStop).toHaveBeenCalledWith(ID.viewpoint)
    })
  })

  it('Série: lands on an open photo, never on one it just trashed (item 1)', async () => {
    const { idsOf } = setup({ mutate: lakeSeries })
    const lake = idsOf(ID.lake)
    await openStop(3)
    await click('Podobné: 4')
    await act(async () => {
      fireEvent.click(bulk())
    })
    const shown = screen.getByTestId('sort-photo').querySelector('figure')
      ?.dataset.photoId
    expect(lake.filter((id) => id !== lake[1])).not.toContain(shown)
  })

  it('a failed series trash says so (item 6)', async () => {
    const { actions } = setup({ mutate: lakeSeries })
    actions.trashPhotos.mockRejectedValueOnce(new Error('x'))
    await openStop(3)
    await click('Podobné: 4')
    await act(async () => {
      fireEvent.click(bulk())
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Změna se nepovedla',
    )
  })
})

describe('Full screen controls on touch (M3)', () => {
  const enter = async () => {
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: FULLSCREEN })[0] ?? document.body,
      )
    })
  }

  it('touch moves and their mouse events never hide the controls', async () => {
    setup()
    await enter()
    const root = screen.getByTestId('sort-screen')
    fireEvent.pointerMove(root, { pointerType: 'touch' })
    fireEvent.mouseMove(root)
    expect(screen.getByRole('button', { name: /^Koš/ })).toBeInTheDocument()
  })

  it('a tap hides them, the visible button and the mouse show them again', async () => {
    vi.useFakeTimers()
    try {
      setup()
      await enter()
      const stage = screen.getByTestId('sort-stage')
      fireEvent.touchStart(stage, { touches: [{ clientX: 9, clientY: 9 }] })
      fireEvent.touchEnd(stage, {
        changedTouches: [{ clientX: 9, clientY: 9 }],
      })
      await act(async () => {
        vi.advanceTimersByTime(400)
      })
      // Compatibility mouse events after the tap change nothing.
      fireEvent.mouseMove(stage)
      expect(screen.queryByRole('button', { name: /^Koš/ })).toBeNull()
      const show = screen.getByTestId('show-controls')
      expect(show.className).not.toMatch(/sr-only/)
      fireEvent.click(show)
      expect(screen.getByRole('button', { name: /^Koš/ })).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'Zavřít celou obrazovku' }),
      )
      await enter()
      fireEvent.pointerMove(screen.getByTestId('sort-screen'), {
        pointerType: 'mouse',
      })
      await act(async () => {
        vi.advanceTimersByTime(3000)
      })
      expect(screen.queryByRole('button', { name: /^Koš/ })).toBeNull()
      fireEvent.pointerMove(screen.getByTestId('sort-screen'), {
        pointerType: 'mouse',
      })
      expect(screen.getByRole('button', { name: /^Koš/ })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('the position label moves to the top in full screen (V5)', async () => {
    setup()
    await enter()
    expect(screen.getByTestId('sort-position').className).toMatch(/top-/)
  })
})

describe('Accessibility details (item 8, V4)', () => {
  it('names the stop rows once, ride as "Cestou", and returns focus from the series', async () => {
    setup({ mutate: lakeSeries })
    fireEvent.click(screen.getByTestId('sort-stop-toggle'))
    const panel = screen.getByTestId('sort-stop-panel')
    expect(
      within(panel).getByRole('button', {
        name: 'Otevřít zastávku 1 Hotel, Jasper',
      }),
    ).toHaveTextContent(/^1 · Hotel, Jasper/)
    expect(
      within(panel).getByRole('button', { name: 'Cestou' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sort-stop-toggle'))
    await openStop(3)
    const chip = screen.getByRole('button', { name: 'Podobné: 4' })
    chip.focus()
    await click('Podobné: 4')
    expect(
      within(series()).getAllByRole('button', { name: /^Fotka / })[0],
    ).toBeInTheDocument()
    await key('Escape')
    expect(document.activeElement).toBe(chip)
  })

  it('makes the series grid inert while the compare is open', async () => {
    setup({ mutate: lakeSeries })
    await openStop(3)
    await click('Podobné: 4')
    await act(async () => {
      fireEvent.click(
        within(series()).getByRole('button', { name: 'Porovnat 2 vybrané' }),
      )
    })
    expect(
      within(series()).getAllByTestId('series-toggle')[0]?.closest('[inert]'),
    ).not.toBeNull()
  })

  it('the duel has a swap button for touch and forgets the hovered photo', async () => {
    setup({ mutate: lakeSeries })
    await openStop(3)
    await click(/^Porovnat/)
    const duel = screen.getByRole('dialog', { name: 'Porovnání' })
    const swap = within(duel).getByRole('button', { name: 'Prohodit strany' })
    fireEvent.click(swap)
    expect(swap).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(duel)
        .getAllByTestId('duel-pane')
        .map((p) => p.dataset.role),
    ).toEqual(['challenger', 'winner'])
  })
})
