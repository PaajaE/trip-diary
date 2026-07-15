import { describe, expect, it } from 'vitest'
import { resolveJourneyMapPresentation } from '@/features/journeys/journey-map-presentation'

describe('journey map presentation', () => {
  it('shows loading before stop data is available', () => {
    expect(
      resolveJourneyMapPresentation({
        camera: null,
        isError: false,
        isFetched: false,
        isLoading: true,
        isOnline: true,
        mappableStops: [],
        result: undefined,
        supabaseConfigured: true,
      }).showInitialLoading,
    ).toBe(true)
  })

  it('distinguishes offline unavailable from authoritative empty state', () => {
    const offlineUnavailable = resolveJourneyMapPresentation({
      camera: null,
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: false,
      mappableStops: [],
      result: {
        cachedAt: null,
        isAuthoritativeEmpty: false,
        isFromCache: false,
        isOffline: true,
        refreshFailed: false,
        stops: [],
      },
      supabaseConfigured: true,
    })

    const authoritativeEmpty = resolveJourneyMapPresentation({
      camera: null,
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: true,
      mappableStops: [],
      result: {
        cachedAt: '2026-07-10T08:00:00.000Z',
        isAuthoritativeEmpty: true,
        isFromCache: false,
        isOffline: false,
        refreshFailed: false,
        stops: [],
      },
      supabaseConfigured: true,
    })

    expect(offlineUnavailable.showMapUnavailable).toBe(true)
    expect(offlineUnavailable.statusMessageKey).toBe(
      'mobile.journeyMapOfflineUnavailable',
    )
    expect(authoritativeEmpty.showAuthoritativeEmpty).toBe(true)
  })

  it('shows refresh-failed banner when cached stops remain visible', () => {
    const presentation = resolveJourneyMapPresentation({
      camera: {
        center: { latitude: 49.1951, longitude: 16.6068 },
        type: 'center',
        zoomLevel: 12,
      },
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: true,
      mappableStops: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          latitude: 49.1951,
          longitude: 16.6068,
          status: 'visited',
          title: 'Brno',
        },
      ],
      result: {
        cachedAt: '2026-07-10T08:00:00.000Z',
        isAuthoritativeEmpty: false,
        isFromCache: true,
        isOffline: false,
        refreshFailed: true,
        stops: [],
      },
      supabaseConfigured: true,
    })

    expect(presentation.showCachedBanner).toBe(true)
    expect(presentation.statusMessageKey).toBe('mobile.journeyMapRefreshFailed')
  })
})
