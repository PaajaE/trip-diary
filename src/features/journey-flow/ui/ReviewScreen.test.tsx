import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { ProbableDuplicate } from '@trip-diary/core/automation'
import {
  buildFlowDays,
  type FlowDay,
} from '@/features/journey-flow/model/flow-days'
import {
  addRun,
  EMPTY_MARKERS,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'
import {
  ReviewScreen,
  type ReviewActions,
} from '@/features/journey-flow/ui/ReviewScreen'
import { at, fixtureDay, ID } from '@/features/journey-flow/test-fixtures'
import { buildMoveStops } from '@/features/media-batch/model/move-sheet'

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
      AttributionControl: function AttributionControl() {
        return undefined
      },
      LngLatBounds: Bounds,
      Map: MapMock,
      Marker: Chain,
    },
  }
})
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('@/shared/lib/map-style', () => ({ getAppMapStyle: () => ({}) }))

function actionsMock() {
  return {
    acknowledgeArrivals: vi.fn(),
    assignToStop: vi.fn().mockResolvedValue(2),
    confirmStops: vi.fn().mockResolvedValue(undefined),
    fixCopyTime: vi.fn().mockResolvedValue(1),
    keepBoth: vi.fn(),
    markOpened: vi.fn(),
    mergeWithPrevious: vi.fn().mockResolvedValue('x'),
    movePhotos: vi.fn().mockResolvedValue(1),
    promoteEnRoute: vi.fn().mockResolvedValue(undefined),
    renameStop: vi.fn().mockResolvedValue(undefined),
    splitStop: vi.fn().mockResolvedValue('new'),
    trashCopy: vi.fn().mockResolvedValue(1),
  } satisfies ReviewActions
}

const markers = addRun(EMPTY_MARKERS, 'r', [ID.viewpoint])

function setup(
  options: {
    day?: (day: FlowDay) => FlowDay
    markers?: FlowMarkers
  } = {},
) {
  const { media, placeNames, tree } = fixtureDay()
  const flow = buildFlowDays({
    homeTz: 'UTC',
    markers: options.markers ?? markers,
    placeNames,
    tree,
  })
  const found = flow.days[0]
  if (found === undefined) throw new Error('no day')
  const day = options.day === undefined ? found : options.day(found)
  const actions = actionsMock()
  const onContinue = vi.fn()
  const moveStops = buildMoveStops(
    tree,
    i18n.t.bind(i18n),
    'cs',
    placeNames,
    'UTC',
  )
  const view = render(
    <ReviewScreen
      actions={actions}
      day={day}
      journeyId="j1"
      lookup={new Map(media.map((item) => [item.id, item]))}
      markers={options.markers ?? markers}
      moveStops={moveStops}
      onContinue={onContinue}
    />,
  )
  return { actions, day, media, onContinue, ...view }
}

async function openMenu(name: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }))
}

describe('ReviewScreen (Kontrola zastávek)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('cs')
  })
  afterEach(cleanup)

  it('shows only the stops to check first, with skeleton, "nová" and no made-up time title', () => {
    setup()
    expect(screen.getByText('Hledám místo…')).toBeInTheDocument()
    expect(screen.getByText('nová')).toBeInTheDocument()
    expect(screen.getByText(/kolem 10:42/)).toBeInTheDocument()
    expect(screen.queryByText(/Zastávka 10:42/)).toBeNull()
    expect(screen.queryByText('Hotel, Jasper')).toBeNull()
  })

  it('toggles between "Ke kontrole" and "Celý den"', () => {
    setup()
    const all = screen.getByRole('button', { name: /^Celý den · 4$/ })
    expect(all).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(all)
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Hotel, Jasper')).toBeInTheDocument()
    expect(screen.getByText('Maligne Lake')).toBeInTheDocument()
    expect(screen.getByText('Túra k jezeru')).toBeInTheDocument()
    expect(screen.getByText('Cestou')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Ke kontrole/ }))
    expect(screen.queryByText('Hotel, Jasper')).toBeNull()
  })

  it('shows a locked stop with its lock and no uncertain dot', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^Celý den/ }))
    const card = screen.getByText('Maligne Lake').closest('article')
    if (card === null) throw new Error('no card')
    expect(
      within(card).getByRole('img', { name: 'Zamčeno' }),
    ).toBeInTheDocument()
    expect(within(card).queryByRole('img', { name: /Nejistá/ })).toBeNull()
  })

  it('expands "Cestou" and makes a stop of it with one tap', () => {
    const { actions } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Celý den/ }))
    const ride = screen.getByRole('button', { name: /Cestou/ })
    expect(ride).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('button', { name: 'Udělat z ní zastávku' }),
    ).toBeNull()
    fireEvent.click(ride)
    fireEvent.click(
      screen.getByRole('button', { name: 'Udělat z ní zastávku' }),
    )
    expect(actions.promoteEnRoute).toHaveBeenCalledWith(ID.ride)
  })

  it('merges with the previous stop from the stop menu', () => {
    const { actions } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Celý den/ }))
    const lake = screen
      .getAllByRole('article')
      .find((a) => a.dataset.stopId === ID.lake)
    if (lake === undefined) throw new Error('no lake')
    fireEvent.click(
      within(lake).getByRole('button', { name: /^Akce zastávky/ }),
    )
    fireEvent.click(
      within(lake).getByRole('button', {
        name: 'Spojit s předchozí zastávkou',
      }),
    )
    expect(actions.mergeWithPrevious).toHaveBeenCalledWith(
      ID.viewpoint,
      ID.lake,
    )
  })

  it('renames a stop through the dialog', async () => {
    const { actions } = setup()
    await openMenu(/Akce zastávky Hledám místo/)
    fireEvent.click(screen.getByRole('button', { name: 'Přejmenovat' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Název zastávky'), {
      target: { value: '  Vyhlídka  ' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Uložit' }))
    expect(actions.renameStop).toHaveBeenCalledWith(ID.viewpoint, 'Vyhlídka')
  })

  it('splits a stop at a chosen photo and shows both parts first', async () => {
    const { actions } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Celý den/ }))
    const lake = screen
      .getAllByRole('article')
      .find((a) => a.dataset.stopId === ID.lake)
    if (lake === undefined) throw new Error('no lake')
    fireEvent.click(
      within(lake).getByRole('button', { name: /^Akce zastávky/ }),
    )
    fireEvent.click(
      within(lake).getByRole('button', { name: 'Rozdělit zastávku' }),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Fotka v 12:20' }),
    )
    expect(within(dialog).getByText(/Po řezu: /)).toBeInTheDocument()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Rozdělit na 2 zastávky' }),
    )
    expect(actions.splitStop).toHaveBeenCalledWith(ID.lake, at('12:20'))
  })

  it('moves picked photos to another stop through the MoveToSheet', () => {
    const { actions } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Celý den/ }))
    const lake = screen
      .getAllByRole('article')
      .find((a) => a.dataset.stopId === ID.lake)
    if (lake === undefined) throw new Error('no lake')
    fireEvent.click(
      within(lake).getByRole('button', { name: /^Akce zastávky/ }),
    )
    fireEvent.click(
      within(lake).getByRole('button', { name: 'Přesunout fotky' }),
    )
    const picker = screen.getByRole('dialog')
    fireEvent.click(
      within(picker).getByRole('button', { name: 'Fotka v 12:05' }),
    )
    fireEvent.click(
      within(picker).getByRole('button', { name: 'Přesunout fotky' }),
    )
    const sheet = screen.getByRole('dialog')
    fireEvent.click(
      within(sheet).getByRole('button', { name: /Hotel, Jasper/ }),
    )
    expect(actions.movePhotos).toHaveBeenCalledTimes(1)
    const [ids, stopId] = actions.movePhotos.mock.calls[0] ?? []
    expect(ids).toHaveLength(1)
    expect(stopId).toBe(ID.hotel)
  })

  it('marks a to-check stop opened and counts the unopened ones', () => {
    const { actions } = setup()
    const note = screen.getByText(/ke kontrole jsi ještě neotevřel/)
    expect(note.textContent).toMatch(/^\d+ zastáv/)
    fireEvent.click(screen.getByText('Hledám místo…'))
    expect(actions.markOpened).toHaveBeenCalledWith('j1', ID.viewpoint)
    expect(screen.getByRole('button', { name: 'Ukázat' })).toBeInTheDocument()
  })

  it('confirms ALL stops of the day, keeps the button enabled and continues', async () => {
    const { actions, onContinue } = setup()
    const confirm = screen.getByRole('button', {
      name: 'Zastávky sedí, třídit fotky',
    })
    expect(confirm).toBeEnabled()
    expect(
      screen.getByText(
        'Potvrdí všechny 4 zastávky. Zamknou se a další nahrání je nepřeskupí.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(confirm)
    await vi.waitFor(() => {
      expect(onContinue).toHaveBeenCalledWith('2026-06-05')
    })
    const ids = actions.confirmStops.mock.calls[0]?.[0] ?? []
    // Every unlocked stop (the locked one is already confirmed), rides too.
    expect([...ids].sort()).toEqual(
      [ID.hotel, ID.lake, ID.ride, ID.viewpoint].sort(),
    )
    expect(actions.acknowledgeArrivals).toHaveBeenCalledTimes(1)
  })

  it('shows a failure and does not continue when confirming fails', async () => {
    const { actions, onContinue } = setup()
    actions.confirmStops.mockRejectedValueOnce(new Error('x'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Zastávky sedí, třídit fotky' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Změna se nepovedla',
    )
    expect(onContinue).not.toHaveBeenCalled()
  })

  describe('Nezařazené', () => {
    it('assigns a suggested group without the deselected photo', async () => {
      const { actions } = setup()
      fireEvent.click(screen.getByRole('button', { name: /^Nezařazené/ }))
      const dialog = screen.getByRole('dialog', { name: 'Nezařazené' })
      const assign = within(dialog).getByRole('button', {
        name: 'Zařadit všechny 2',
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Fotka v 13:00' }),
      )
      const one = within(dialog).getByRole('button', { name: 'Zařadit fotku' })
      expect(assign).toBe(one)
      fireEvent.click(one)
      await vi.waitFor(() => {
        expect(actions.assignToStop).toHaveBeenCalledTimes(1)
      })
      const [ids, stopId] = actions.assignToStop.mock.calls[0] ?? []
      expect(ids).toHaveLength(1)
      expect(stopId).toBe(ID.lake)
    })

    it('offers the three ways out for a probable copy', async () => {
      const { actions } = setup({
        day: (day) => {
          const [original, copy] = day.unassigned
          if (original === undefined || copy === undefined) throw new Error('x')
          const pair: ProbableDuplicate = {
            id: copy.id,
            offsetSeconds: 7200,
            originalId: original.id,
            reason: 'test',
          } as ProbableDuplicate
          return { ...day, duplicates: [pair] }
        },
      })
      fireEvent.click(screen.getByRole('button', { name: /^Nezařazené/ }))
      const dialog = screen.getByRole('dialog', { name: 'Nezařazené' })
      expect(within(dialog).getByText('Podezřelé kopie')).toBeInTheDocument()
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Je to kopie, do koše' }),
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Opravit čas' }),
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Nechat obě' }),
      )
      await vi.waitFor(() => {
        expect(actions.fixCopyTime).toHaveBeenCalledWith(
          expect.any(String),
          7200,
        )
      })
      expect(actions.trashCopy).toHaveBeenCalledTimes(1)
      expect(actions.keepBoth).toHaveBeenCalledWith('j1', expect.any(String))
    })
  })

  describe('on a phone (390 px, touch only)', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => ({
          addEventListener: () => undefined,
          matches: query.includes('max-width'),
          media: query,
          removeEventListener: () => undefined,
        }),
      })
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 390,
      })
    })
    afterEach(() => {
      Reflect.deleteProperty(window, 'matchMedia')
    })

    it('reaches every edit action by tapping, each at least 44 px high', () => {
      setup()
      fireEvent.click(screen.getByRole('button', { name: /^Celý den/ }))
      const lake = screen
        .getAllByRole('article')
        .find((a) => a.dataset.stopId === ID.lake)
      if (lake === undefined) throw new Error('no lake')
      fireEvent.click(
        within(lake).getByRole('button', { name: /^Akce zastávky/ }),
      )
      for (const name of [
        'Spojit s předchozí zastávkou',
        'Rozdělit zastávku',
        'Přejmenovat',
        'Přesunout fotky',
      ]) {
        expect(within(lake).getByRole('button', { name }).className).toContain(
          'min-h-11',
        )
      }
      expect(
        screen.getByRole('button', { name: 'Zastávky sedí, třídit fotky' })
          .className,
      ).toContain('min-h-11')
      for (const menu of screen.getAllByRole('button', {
        name: /^Akce zastávky/,
      })) {
        expect(menu.className).toContain('size-11')
      }
    })
  })
})
