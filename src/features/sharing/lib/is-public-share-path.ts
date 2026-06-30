const RESERVED_ROOT_SEGMENTS = new Set([
  'dashboard',
  'sign-in',
  'sign-up',
  'settings',
  'entries',
  'journeys',
  'j',
  'e',
  'spaces',
  'invite',
  'journey-invite',
  'u',
])

export function isPublicSharePath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return false
  }
  const firstSegment = segments[0]
  if (firstSegment === undefined) {
    return false
  }
  return !RESERVED_ROOT_SEGMENTS.has(firstSegment)
}
