import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render as rtlRender } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { JourneyWorkspaceState } from '@/features/journey-workspace/api/use-journey-workspace'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg } from '@/features/journey-workspace/test-fixtures'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'

const mapCalls = vi.hoisted(() => ({
  constructed: 0,
  remove: 0,
  views: 0,
  setLngLat: 0,
  markersAdded: 0,
  setData: 0,
}))

vi.mock('maplibre-gl', () => {
  class MapMock {
    constructor() {
      mapCalls.constructed += 1
    }
    addControl = vi.fn()
    on(event: string, cb: () => void) {
      if (event === 'load') cb()
    }
    getSource() {
      return undefined
    }
    addSource = vi.fn()
    addLayer = vi.fn()
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
      return 5
    }
    remove() {
      mapCalls.remove += 1
    }
  }
  class MarkerMock {
    setLngLat() {
      mapCalls.setLngLat += 1
      return this
    }
    addTo() {
      mapCalls.markersAdded += 1
      return this
    }
    remove = vi.fn()
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

describe('WorkspaceMap stability', () => {
  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn()
    Object.assign(mapCalls, {
      constructed: 0,
      remove: 0,
      views: 0,
      setLngLat: 0,
      markersAdded: 0,
      setData: 0,
    })
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
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
})
