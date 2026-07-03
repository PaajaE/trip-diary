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
