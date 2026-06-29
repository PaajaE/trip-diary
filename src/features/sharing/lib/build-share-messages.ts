import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import {
  buildPublicJourneyPath,
  buildPublicMomentPath,
  buildPublicSpacePath,
} from '@/features/sharing/lib/public-paths'
import {
  buildAppAbsoluteUrl,
  buildSharePreviewUrl,
} from '@/features/sharing/lib/site-url'

export function composeShareText(message: string, url: string): string {
  return `${message}\n${url}`
}

export function buildPublicTripShare(
  paths: PublicJourneyPaths,
  tripMessage: string,
) {
  const path = buildPublicJourneyPath(paths)
  const shareUrl = buildSharePreviewUrl(path)
  return { shareText: composeShareText(tripMessage, shareUrl), shareUrl }
}

export function buildPublicMomentShare(
  paths: PublicJourneyPaths,
  entrySlug: string,
  momentMessage: string,
) {
  const path = buildPublicMomentPath(paths, entrySlug)
  const shareUrl = buildSharePreviewUrl(path)
  return { shareText: composeShareText(momentMessage, shareUrl), shareUrl }
}

export function buildEntryPublicShare(
  data: { momentPath: string | null; standalonePath: string },
  momentMessage: string,
) {
  const path = data.momentPath ?? data.standalonePath
  const shareUrl = buildSharePreviewUrl(path)
  return { shareText: composeShareText(momentMessage, shareUrl), shareUrl }
}

export function buildPublicSpaceShare(spaceHandle: string, spaceMessage: string) {
  const path = buildPublicSpacePath(spaceHandle)
  const shareUrl = buildSharePreviewUrl(path)
  return { shareText: composeShareText(spaceMessage, shareUrl), shareUrl }
}

export function buildCanonicalPublicUrl(path: string): string {
  return buildAppAbsoluteUrl(path)
}
