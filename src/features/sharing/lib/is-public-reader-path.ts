import { isPublicSharePath } from '@/features/sharing/lib/is-public-share-path'

/** Public trip or moment pages — immersive reader chrome (not space hub). */
export function isPublicReaderPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  if (!isPublicSharePath(pathname) || segments.length < 2) {
    return false
  }
  if (segments[1] === 'tipy') {
    return false
  }
  return true
}

/** Owner entry detail (`/e/:entryId`) — same immersive chrome as public moments. */
export function isOwnerMomentPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 2 && segments[0] === 'e'
}

/** Hide AppShell header so reader/owner moment chrome can lead. */
export function isImmersiveReaderShellPath(pathname: string): boolean {
  return isPublicReaderPath(pathname) || isOwnerMomentPath(pathname)
}
