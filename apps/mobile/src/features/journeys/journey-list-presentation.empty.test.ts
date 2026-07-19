import { describe, expect, it } from 'vitest'
import type { JourneyListLoadResult } from '@/features/journeys/api/journeys.repository'
import { resolveJourneyListCreateCta } from '@/features/journeys/journey-list-create-cta'
import { resolveJourneyListPresentation } from '@/features/journeys/journey-list-presentation'

function listResult(
  journeysCount: number,
  overrides: Partial<JourneyListLoadResult> = {},
): JourneyListLoadResult {
  return {
    cachedAt: new Date().toISOString(),
    isAuthoritativeEmpty: journeysCount === 0,
    isFromCache: false,
    isOffline: false,
    journeys: Array.from({ length: journeysCount }, (_, index) => ({
      endsAt: null,
      id: `00000000-0000-4000-8000-00000000000${String(index)}`,
      startsAt: null,
      status: 'planning' as const,
      summary: '',
      title: `Trip ${String(index)}`,
      updatedAt: new Date().toISOString(),
    })),
    refreshFailed: false,
    spaceId: 'space-1',
    ...overrides,
  }
}

describe('journey list empty/create presentation', () => {
  it('shows authoritative empty after deleting the last journey', () => {
    const presentation = resolveJourneyListPresentation({
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: true,
      journeysCount: 0,
      result: listResult(0, { isAuthoritativeEmpty: true }),
      spaceResolved: true,
      supabaseConfigured: true,
    })

    expect(presentation.showAuthoritativeEmpty).toBe(true)
    expect(presentation.showOfflineUnavailable).toBe(false)
    expect(presentation.showRemoteError).toBe(false)
    expect(
      resolveJourneyListCreateCta({
        canAttemptCreate: true,
        isOnline: true,
        journeysCount: 0,
        presentation,
      }),
    ).toBe('empty')
  })

  it('does not treat a cached empty offline list as authoritative empty', () => {
    const presentation = resolveJourneyListPresentation({
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: false,
      journeysCount: 0,
      result: listResult(0, {
        isAuthoritativeEmpty: false,
        isFromCache: false,
        isOffline: true,
      }),
      spaceResolved: true,
      supabaseConfigured: true,
    })

    expect(presentation.showAuthoritativeEmpty).toBe(false)
    expect(presentation.showOfflineUnavailable).toBe(true)
    expect(
      resolveJourneyListCreateCta({
        canAttemptCreate: false,
        isOnline: false,
        journeysCount: 0,
        presentation,
      }),
    ).toBe('none')
  })

  it('does not show empty state when remote fetch failed', () => {
    const presentation = resolveJourneyListPresentation({
      isError: true,
      isFetched: true,
      isLoading: false,
      isOnline: true,
      journeysCount: 0,
      result: undefined,
      spaceResolved: true,
      supabaseConfigured: true,
    })

    expect(presentation.showAuthoritativeEmpty).toBe(false)
    expect(presentation.showRemoteError).toBe(true)
    expect(
      resolveJourneyListCreateCta({
        canAttemptCreate: true,
        isOnline: true,
        journeysCount: 0,
        presentation,
      }),
    ).toBe('none')
  })

  it('does not show empty state when space is unresolved', () => {
    const presentation = resolveJourneyListPresentation({
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: true,
      journeysCount: 0,
      result: undefined,
      spaceResolved: false,
      supabaseConfigured: true,
    })

    expect(presentation.showAuthoritativeEmpty).toBe(false)
    expect(presentation.showSpaceUnresolved).toBe(true)
    expect(
      resolveJourneyListCreateCta({
        canAttemptCreate: true,
        isOnline: true,
        journeysCount: 0,
        presentation,
      }),
    ).toBe('none')
  })

  it('shows one header create CTA when journeys exist', () => {
    const presentation = resolveJourneyListPresentation({
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: true,
      journeysCount: 2,
      result: listResult(2, { isAuthoritativeEmpty: false }),
      spaceResolved: true,
      supabaseConfigured: true,
    })

    expect(presentation.showAuthoritativeEmpty).toBe(false)
    expect(
      resolveJourneyListCreateCta({
        canAttemptCreate: true,
        isOnline: true,
        journeysCount: 2,
        presentation,
      }),
    ).toBe('header')
  })

  it('shows offline create hint instead of a create button when offline with journeys', () => {
    const presentation = resolveJourneyListPresentation({
      isError: false,
      isFetched: true,
      isLoading: false,
      isOnline: false,
      journeysCount: 1,
      result: listResult(1, {
        isAuthoritativeEmpty: false,
        isFromCache: true,
        isOffline: true,
      }),
      spaceResolved: true,
      supabaseConfigured: true,
    })

    expect(
      resolveJourneyListCreateCta({
        canAttemptCreate: false,
        isOnline: false,
        journeysCount: 1,
        presentation,
      }),
    ).toBe('offline-hint')
  })
})
