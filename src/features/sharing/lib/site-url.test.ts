import { describe, expect, it, vi } from 'vitest'

describe('site-url', () => {
  it('builds og-share preview urls from supabase origin', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SITE_URL', 'https://cestovni-denik.cz')
    vi.resetModules()

    const { buildSharePreviewUrl } =
      await import('@/features/sharing/lib/site-url')

    expect(buildSharePreviewUrl('/ecerovi/kanada-2026')).toBe(
      'https://example.supabase.co/functions/v1/og-share?path=%2Fecerovi%2Fkanada-2026',
    )
  })
})
