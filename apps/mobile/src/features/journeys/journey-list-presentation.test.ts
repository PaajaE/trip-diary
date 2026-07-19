import { describe, expect, it } from 'vitest'
import {
  resolveJourneyListPresentation,
  resolveStatusMessageKey,
  shouldInvalidateJourneyListOnReconnect,
} from '@/features/journeys/journey-list-presentation'
import type { JourneyListLoadResult } from '@/features/journeys/api/journeys.repository'

const sampleJourney = {
  endsAt: null,
  id: '11111111-1111-4111-8111-111111111111',
  startsAt: '2026-07-10',
  status: 'active' as const,
  summary: null,
  title: 'Saved trip',
  updatedAt: '2026-07-10T08:00:00.000Z',
}

function loadResult(
  overrides: Partial<JourneyListLoadResult> = {},
): JourneyListLoadResult {
  return {
    cachedAt: '2026-07-10T08:00:00.000Z',
    isAuthoritativeEmpty: false,
    isFromCache: false,
    isOffline: false,
    journeys: [sampleJourney],
    refreshFailed: false,
    spaceId: 'space-1',
    ...overrides,
  }
}

describe('journey list presentation', () => {
  it('shows offline saved copy when cached data is shown offline', () => {
    expect(
      resolveStatusMessageKey({
        isFromCache: true,
        isOffline: true,
        refreshFailed: false,
      }),
    ).toBe('mobile.journeyListOfflineSaved')
  })

  it('shows refresh-failed copy when cached data survives a failed refresh', () => {
    expect(
      resolveStatusMessageKey({
        isFromCache: true,
        isOffline: false,
        refreshFailed: true,
      }),
    ).toBe('mobile.journeyListRefreshFailed')
  })

  it('distinguishes offline-unavailable from authoritative empty state', () => {
    const offlineUnavailable = resolveJourneyListPresentation({
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: false,
      journeysCount: 0,
      result: loadResult({
        isFromCache: false,
        isOffline: true,
        journeys: [],
      }),
      spaceResolved: true,
      supabaseConfigured: true,
    })

    const authoritativeEmpty = resolveJourneyListPresentation({
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: true,
      journeysCount: 0,
      result: loadResult({
        isAuthoritativeEmpty: true,
        journeys: [],
      }),
      spaceResolved: true,
      supabaseConfigured: true,
    })

    expect(offlineUnavailable.showOfflineUnavailable).toBe(true)
    expect(offlineUnavailable.showAuthoritativeEmpty).toBe(false)
    expect(authoritativeEmpty.showAuthoritativeEmpty).toBe(true)
    expect(authoritativeEmpty.showOfflineUnavailable).toBe(false)
  })

  it('shows cached banner for offline saved data and failed refresh', () => {
    expect(
      resolveJourneyListPresentation({
        isError: false,
        isFetched: true,
        isLoading: false,
        isOnline: false,
        journeysCount: 1,
        result: loadResult({ isFromCache: true, isOffline: true }),
        spaceResolved: true,
        supabaseConfigured: true,
      }).showCachedBanner,
    ).toBe(true)

    expect(
      resolveJourneyListPresentation({
        isError: false,
        isFetched: true,
        isLoading: false,
        isOnline: true,
        journeysCount: 1,
        result: loadResult({ isFromCache: true, refreshFailed: true }),
        spaceResolved: true,
        supabaseConfigured: true,
      }).showCachedBanner,
    ).toBe(true)
  })

  it('shows remote error only when online, configured, and no cache exists', () => {
    expect(
      resolveJourneyListPresentation({
        isError: true,
        isFetched: true,
        isLoading: false,
        isOnline: true,
        journeysCount: 0,
        result: undefined,
        spaceResolved: true,
        supabaseConfigured: true,
      }).showRemoteError,
    ).toBe(true)

    expect(
      resolveJourneyListPresentation({
        isError: true,
        isFetched: true,
        isLoading: false,
        isOnline: true,
        journeysCount: 1,
        result: loadResult({ isFromCache: true, refreshFailed: true }),
        spaceResolved: true,
        supabaseConfigured: true,
      }).showRemoteError,
    ).toBe(false)
  })

  it('requests one refresh when reconnecting', () => {
    expect(shouldInvalidateJourneyListOnReconnect(false, true)).toBe(true)
    expect(shouldInvalidateJourneyListOnReconnect(true, true)).toBe(false)
    expect(shouldInvalidateJourneyListOnReconnect(false, false)).toBe(false)
  })
})
