import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import {
  buildAbsoluteUrl,
  buildPublicJourneyPath,
  buildPublicMomentPath,
  buildPublicSpacePath,
} from '@/features/sharing/lib/public-paths'

export function buildTripShareText(title: string, url: string): string {
  return `Sledujte naši cestu: ${title}\n${url}`
}

export function buildMomentShareText(title: string, url: string): string {
  return `Nový moment: ${title}\n${url}`
}

export function buildSpaceShareText(name: string, url: string): string {
  return `Cestovní deník: ${name}\n${url}`
}

export function buildPublicTripShare(
  paths: PublicJourneyPaths,
  title: string,
) {
  const url = buildAbsoluteUrl(buildPublicJourneyPath(paths))
  return { shareText: buildTripShareText(title, url), shareUrl: url }
}

export function buildPublicMomentShare(
  paths: PublicJourneyPaths,
  entrySlug: string,
  title: string,
) {
  const url = buildAbsoluteUrl(buildPublicMomentPath(paths, entrySlug))
  return { shareText: buildMomentShareText(title, url), shareUrl: url }
}

export function buildEntryPublicShare(
  data: { momentPath: string | null; standalonePath: string },
  title: string,
) {
  const path = data.momentPath ?? data.standalonePath
  const url = buildAbsoluteUrl(path)
  return { shareText: buildMomentShareText(title, url), shareUrl: url }
}

export function buildPublicSpaceShare(spaceHandle: string, name: string) {
  const url = buildAbsoluteUrl(buildPublicSpacePath(spaceHandle))
  return { shareText: buildSpaceShareText(name, url), shareUrl: url }
}
