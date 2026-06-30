import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeShareText } from '@/features/sharing/lib/build-share-messages'

describe('build-share-messages', () => {
  const paths = {
    journeySlug: 'iceland-2026',
    spaceHandle: 'ecerovi',
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('composes share text with message and url on separate lines', () => {
    expect(composeShareText('Hello trip', 'https://example.com/trip')).toBe(
      'Hello trip\nhttps://example.com/trip',
    )
  })

  it('builds trip share payload from localized message', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    const { buildPublicTripShare } =
      await import('@/features/sharing/lib/build-share-messages')

    const result = buildPublicTripShare(paths, 'Follow our trip: Iceland')

    expect(result.shareUrl).toContain('og-share')
    expect(result.shareUrl).toContain(
      encodeURIComponent('/ecerovi/iceland-2026'),
    )
    expect(result.shareText).toBe(
      `Follow our trip: Iceland\n${result.shareUrl}`,
    )
  })

  it('builds moment share payload from localized message', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    const { buildPublicMomentShare } =
      await import('@/features/sharing/lib/build-share-messages')

    const result = buildPublicMomentShare(
      paths,
      'glacier-hike',
      'New moment: Glacier hike',
    )

    expect(result.shareUrl).toContain('og-share')
    expect(result.shareUrl).toContain(
      encodeURIComponent('/ecerovi/iceland-2026/glacier-hike'),
    )
    expect(result.shareText).toBe(
      `New moment: Glacier hike\n${result.shareUrl}`,
    )
  })
})
