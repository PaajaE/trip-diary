const APP_SCHEME = 'tripdiary:'
const APP_HOST = 'app'

/**
 * Maps a native deep link (`tripdiary://app/<path>?<query>`) to an in-app
 * router path. Returns null for anything else so foreign URLs are ignored.
 */
export function resolveDeepLinkPath(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== APP_SCHEME || parsed.host !== APP_HOST) {
    return null
  }

  const path = parsed.pathname === '' ? '/' : parsed.pathname
  if (!path.startsWith('/') || path.startsWith('//')) {
    return null
  }

  return `${path}${parsed.search}`
}
