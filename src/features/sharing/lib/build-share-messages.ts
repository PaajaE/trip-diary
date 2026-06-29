import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import {
  buildAbsoluteUrl,
  buildPublicJourneyPath,
  buildPublicMomentPath,
  buildPublicSpacePath,
} from '@/features/sharing/lib/public-paths'

export function composeShareText(message: string, url: string): string {
  return `${message}\n${url}`
}

export function buildPublicTripShare(
  paths: PublicJourneyPaths,
  tripMessage: string,
) {
  const url = buildAbsoluteUrl(buildPublicJourneyPath(paths))
  return { shareText: composeShareText(tripMessage, url), shareUrl: url }
}

export function buildPublicMomentShare(
  paths: PublicJourneyPaths,
  entrySlug: string,
  momentMessage: string,
) {
  const url = buildAbsoluteUrl(buildPublicMomentPath(paths, entrySlug))
  return { shareText: composeShareText(momentMessage, url), shareUrl: url }
}

export function buildEntryPublicShare(
  data: { momentPath: string | null; standalonePath: string },
  momentMessage: string,
) {
  const path = data.momentPath ?? data.standalonePath
  const url = buildAbsoluteUrl(path)
  return { shareText: composeShareText(momentMessage, url), shareUrl: url }
}

export function buildPublicSpaceShare(spaceHandle: string, spaceMessage: string) {
  const url = buildAbsoluteUrl(buildPublicSpacePath(spaceHandle))
  return { shareText: composeShareText(spaceMessage, url), shareUrl: url }
}
