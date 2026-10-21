import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render as rtlRender,
  screen,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { JourneyWorkspaceState } from '@/features/journey-workspace/api/use-journey-workspace'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'

const mapCalls = vi.hoisted(() => ({
  constructed: 0,
  remove: 0,
  views: 0,
  setLngLat: 0,
  markersAdded: 0,
  markerRemoved: 0,
  clickHandler: null as ((event: unknown) => void) | null,
  zoom: 5,
  lngLats: [] as [number, number][],
  handlers: new Map<string, () => void>(),
  sources: new Map<string, { data: unknown }>(),
}))

vi.mock('maplibre-gl', () => {
  class MapMock {
    constructor() {
      mapCalls.constructed += 1
    }
    addControl = vi.fn()
    on(event: string, a: unknown, b?: unknown) {
      if (event === 'load') (a as () => void)()
      if (event === 'moveend') mapCalls.handlers.set(event, a as () => void)
      if (event === 'click' && typeof b === 'function')
        mapCalls.clickHandler = b as (event: unknown) => void
    }
    getSource(id: string) {
      const source = mapCalls.sources.get(id)
      if (source === undefined) return undefined
      return {
        setData: (data: unknown) => {
          source.data = data
        },
      }
    }
    addSource(id: string, spec: { data: unknown }) {
      mapCalls.sources.set(id, { data: spec.data })
    }
    addLayer = vi.fn()
    getCanvas() {
      return { style: {} }
    }
    fitBounds() {
      mapCalls.views += 1
    }
    flyTo() {
      mapCalls.views += 1
    }
    jumpTo() {
      mapCalls.views += 1
    }
    getZoom() {
      return mapCalls.zoom
    }
    getBounds() {
      return {
        getEast: () => 180,
        getNorth: () => 90,
        getSouth: () => -90,
        getWest: () => -180,
      }
    }
    project(lngLat: [number, number]) {
      return { x: lngLat[0] * 100, y: 0 }
    }
    remove() {
      mapCalls.remove += 1
    }
  }
  class MarkerMock {
    el: HTMLElement
    constructor(options: { element: HTMLElement }) {
      this.el = options.element
    }
    setLngLat(lngLat: [number, number]) {
      mapCalls.lngLats.push(lngLat)
      mapCalls.setLngLat += 1
      return this
    }
    addTo() {
      mapCalls.markersAdded += 1
      document.body.append(this.el)
      return this
    }
    remove() {
      mapCalls.markerRemoved += 1
      this.el.remove()
    }
  }
  const Noop = vi.fn()
  return {
    default: {
      AttributionControl: Noop,
      Map: MapMock,
      Marker: MarkerMock,
      NavigationControl: Noop,
    },
  }
})
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/i">{children}</a>,
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
vi.mock('@/features/journey-workspace/api/use-workspace-edits', () => ({
  useWorkspaceEdits: () => ({
    saveCaption: vi.fn(),
    setCover: vi.fn(),
    toggleStar: vi.fn(),
  }),
}))
let state: JourneyWorkspaceState = { status: 'loading' }
vi.mock('@/features/journey-workspace/api/use-journey-workspace', () => ({
  useJourneyWorkspace: () => state,
}))

function setTree(
  over: { placeId?: string | null; lat?: number; starred?: boolean } = {},
) {
  const moments = [
    mom(10, {
      latitude: over.lat ?? 46,
      longitude: 8,
      placeId: over.placeId ?? null,
    }),
    mom(11, {
      latitude: 46.5,
      longitude: 8.5,
      startsAt: '2026-01-02T12:00:00+00:00',
    }),
    mom(12, {
      latitude: 47,
      longitude: 9,
      startsAt: '2026-01-03T10:00:00+00:00',
    }),
  ]
  const media = [
    med(20, {
      momentId: moments[0]?.id ?? null,
      starred: over.starred === true,
    }),
  ]
  state = {
    status: 'ready',
    tree: buildWorkspaceTree([seg(1)], moments, media),
  }
}

function ui() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <JourneyWorkspace journeyId="j" />
    </QueryClientProvider>
  )
}

const observer = vi.hoisted(() => ({
  callbacks: [] as ((entries: unknown[]) => void)[],
}))

function featureCount(id: string): number {
  const data = mapCalls.sources.get(id)?.data as
    | { features: unknown[] }
    | undefined
  return data?.features.length ?? -1
}

describe('WorkspaceMap focus and stability', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    Object.assign(mapCalls, {
      constructed: 0,
      remove: 0,
      views: 0,
      setLngLat: 0,
      markersAdded: 0,
      markerRemoved: 0,
      clickHandler: null,
      zoom: 5,
      lngLats: [],
      handlers: new Map(),
      sources: new Map(),
    })
    observer.callbacks = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: unknown[]) => void) {
          observer.callbacks.push(cb)
        }
        observe = vi.fn()
        disconnect = vi.fn()
      },
    )
    // Wide screen: the outline (which reports the day in view) is mounted.
    vi.stubGlobal('matchMedia', (query: string) => ({
      addEventListener: vi.fn(),
      matches: true,
      media: query,
      removeEventListener: vi.fn(),
    }))
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('numbers only the focused day: one line, others are dots', () => {
    setTree()
    rtlRender(ui())
    expect(mapCalls.markersAdded).toBe(2)
    expect(featureCount('workspace-day-line')).toBe(1)
    expect(featureCount('workspace-dots')).toBe(1)
    expect(screen.getByTestId('map-caption').textContent).toBe(
      'Fri 2 Jan · 2 places',
    )
  })

  it('does not move the camera on passive focus change, offers zoom to day', () => {
    setTree()
    rtlRender(ui())
    expect(mapCalls.views).toBe(1)
    act(() => {
      for (const cb of observer.callbacks)
        cb([{ isIntersecting: true, target: { id: `ws-moment-${uuid(12)}` } }])
    })
    expect(mapCalls.views).toBe(1)
    // Day 3 has one point: no line, no out-of-focus marker left of day 2.
    expect(featureCount('workspace-day-line')).toBe(0)
    expect(featureCount('workspace-dots')).toBe(2)
    act(() => {
      screen.getByRole('button', { name: 'Zoom to day' }).click()
    })
    expect(mapCalls.views).toBe(2)
    expect(screen.queryByRole('button', { name: 'Zoom to day' })).toBeNull()
  })

  it('moves the camera when a dot is clicked (explicit navigation)', () => {
    setTree()
    rtlRender(ui())
    act(() => {
      for (const cb of observer.callbacks)
        cb([{ isIntersecting: true, target: { id: `ws-moment-${uuid(12)}` } }])
    })
    expect(mapCalls.views).toBe(1)
    act(() => {
      mapCalls.clickHandler?.({ features: [{ properties: { id: uuid(10) } }] })
    })
    expect(mapCalls.views).toBe(2)
    expect(featureCount('workspace-day-line')).toBe(1)
    expect(screen.queryByRole('button', { name: 'Zoom to day' })).toBeNull()
  })

  it('keeps the map and camera when only placeId / starred change', () => {
    setTree()
    const view = rtlRender(ui())
    expect(mapCalls.constructed).toBe(1)
    expect(mapCalls.views).toBe(1)
    expect(mapCalls.markersAdded).toBe(2)
    setTree({ placeId: 'place-1', starred: true })
    view.rerender(ui())
    setTree({ placeId: 'place-2', starred: false })
    view.rerender(ui())
    expect(mapCalls.constructed).toBe(1)
    expect(mapCalls.remove).toBe(0)
    expect(mapCalls.views).toBe(1)
    expect(mapCalls.markersAdded).toBe(2)
  })

  it('moves a pin in place without recreating the map or the camera', () => {
    setTree()
    const view = rtlRender(ui())
    const before = mapCalls.setLngLat
    setTree({ lat: 50 })
    view.rerender(ui())
    expect(mapCalls.setLngLat).toBeGreaterThan(before)
    expect(mapCalls.constructed).toBe(1)
    expect(mapCalls.views).toBe(1)
  })

  const variant = (id: string) => ({
    byteSize: 1,
    createdAt: '2026-01-01T00:00:00+00:00',
    height: 10,
    kind: 'thumb' as const,
    mediaId: id,
    mimeType: 'image/webp' as const,
    storageKey: `k/${id}.webp`,
    width: 10,
  })
  const covered = (n: number, starred = false) =>
    med(100 + n, {
      momentId: uuid(n),
      starred,
      variants: [variant(uuid(100 + n))],
    })
  const thumbUrl = (n: number) =>
    `https://media.cestovni-denik.cz/k/${uuid(100 + n)}.webp`
  const markerIds = () =>
    [...document.querySelectorAll<HTMLElement>('[data-moment-id]')]
      .map((el) => el.dataset.momentId)
      .sort()

  it('renders focused markers as photo bubbles with a number badge', () => {
    const moments = [
      mom(10, { latitude: 46, longitude: 8 }),
      mom(11, {
        latitude: 46.5,
        longitude: 8.5,
        startsAt: '2026-01-02T12:00:00+00:00',
      }),
    ]
    state = {
      status: 'ready',
      tree: buildWorkspaceTree([seg(1)], moments, [covered(10)]),
    }
    rtlRender(ui())
    const photo = document.querySelector<HTMLElement>(
      `[data-moment-id="${uuid(10)}"]`,
    )
    const img = photo?.querySelector('img')
    expect(img?.getAttribute('src')).toBe(thumbUrl(10))
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('alt')).toBe('')
    expect(photo?.querySelector('[data-badge]')?.textContent).toBe('1')
    // No cover: the numbered circle stays.
    const plain = document.querySelector<HTMLElement>(
      `[data-moment-id="${uuid(11)}"]`,
    )
    expect(plain?.querySelector('img')).toBeNull()
    expect(plain?.textContent).toBe('2')
    expect(mapCalls.constructed).toBe(1)
  })

  it('adds collision-free thumbnails at detail zoom', async () => {
    mapCalls.zoom = 12
    const moments = [
      mom(10, { latitude: 46, longitude: 8 }),
      mom(11, { latitude: 46, longitude: 8.1 }),
      // Out of focus (another day); 13 and 14 are 10 px apart on screen.
      mom(12, {
        latitude: 47,
        longitude: 20,
        startsAt: '2026-01-05T10:00:00+00:00',
      }),
      mom(13, {
        latitude: 47,
        longitude: 30,
        startsAt: '2026-01-05T10:00:00+00:00',
      }),
      mom(14, {
        latitude: 47,
        longitude: 30.1,
        startsAt: '2026-01-05T10:00:00+00:00',
      }),
      // Within 34 px of the focused moment 10 (x = 800): focused wins.
      mom(15, {
        latitude: 47,
        longitude: 8.2,
        startsAt: '2026-01-05T10:00:00+00:00',
      }),
    ]
    state = {
      status: 'ready',
      tree: buildWorkspaceTree([seg(1)], moments, [
        covered(10),
        covered(11),
        covered(12),
        covered(13),
        covered(14, true),
        covered(15),
      ]),
    }
    rtlRender(ui())
    await vi.waitFor(() => {
      expect(markerIds()).toEqual(
        [uuid(10), uuid(11), uuid(12), uuid(14)].sort(),
      )
    })
    const added = mapCalls.markersAdded
    act(() => {
      mapCalls.handlers.get('moveend')?.()
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    // Same viewport: markers are reused, none rebuilt.
    expect(mapCalls.markersAdded).toBe(added)
    expect(mapCalls.constructed).toBe(1)
  })

  it('draws no thumbnails when more than 40 moments qualify', async () => {
    mapCalls.zoom = 12
    const moments = [
      mom(10, { latitude: 46, longitude: 8 }),
      ...Array.from({ length: 41 }, (_, i) =>
        mom(200 + i, {
          latitude: 47,
          longitude: 20 + i,
          startsAt: '2026-01-05T10:00:00+00:00',
        }),
      ),
    ]
    state = {
      status: 'ready',
      tree: buildWorkspaceTree([seg(1)], moments, [
        covered(10),
        ...Array.from({ length: 41 }, (_, i) => covered(200 + i)),
      ]),
    }
    rtlRender(ui())
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(markerIds()).toEqual([uuid(10)])
  })

  it('shows a stage bubble in the overview and fits the stage on click', () => {
    const cover = covered(10)
    state = {
      status: 'ready',
      tree: buildWorkspaceTree(
        [seg(1, { coverMediaId: cover.id, title: 'Alps' })],
        [
          mom(10, { latitude: 46, longitude: 8 }),
          mom(11, { latitude: 47, longitude: 9 }),
        ],
        [cover],
      ),
    }
    rtlRender(ui())
    const bubble = document.querySelector<HTMLElement>('[data-stage-id]')
    expect(bubble?.getAttribute('aria-label')).toBe('Stage: Alps')
    expect(bubble?.querySelector('img')?.getAttribute('src')).toBe(thumbUrl(10))
    const before = mapCalls.views
    act(() => {
      bubble?.click()
    })
    expect(mapCalls.views).toBe(before + 1)
  })

  it('never gives marker roots position/top/left/transform; stage sits on a real location', () => {
    const cover = covered(10)
    state = {
      status: 'ready',
      tree: buildWorkspaceTree(
        [seg(1, { coverMediaId: cover.id, title: 'Far' })],
        [
          mom(10, { latitude: 50, longitude: 14 }),
          mom(11, { latitude: 51, longitude: -114 }),
        ],
        [cover],
      ),
    }
    rtlRender(ui())
    const roots = () =>
      [...document.body.children].filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement &&
          el.querySelector('[data-stage-id],[data-moment-id]') !== null,
      )
    const check = () => {
      expect(roots().length).toBeGreaterThan(0)
      for (const root of roots()) {
        for (const prop of ['position', 'top', 'left', 'transform'] as const)
          expect(root.style[prop]).toBe('')
      }
    }
    check()
    const stage = document.querySelector<HTMLElement>('[data-stage-id]')
    act(() => {
      stage?.dispatchEvent(new MouseEvent('mouseenter'))
    })
    check()
    act(() => {
      stage?.dispatchEvent(new MouseEvent('mouseleave'))
      document
        .querySelector<HTMLElement>(`[data-moment-id="${uuid(11)}"]`)
        ?.click()
    })
    check()
    // The stage bubble is on moment 10 (the cover's), not the ocean mean.
    expect(mapCalls.lngLats).toContainEqual([14, 50])
    expect(mapCalls.lngLats.some(([lng]) => lng > -100 && lng < 0)).toBe(false)
  })
})
