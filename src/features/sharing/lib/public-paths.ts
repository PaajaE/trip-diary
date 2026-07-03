import type { JourneyReaderSection } from '@/features/journeys/lib/journey-reader-section'
import {
  buildAppAbsoluteUrl,
  buildSharePreviewUrl,
} from '@/features/sharing/lib/site-url'

export interface PublicJourneyPaths {
  journeySlug: string
  spaceHandle: string
}

export function buildPublicJourneyPath(
  paths: PublicJourneyPaths,
  section?: JourneyReaderSection,
): string {
  const base = `/${paths.spaceHandle}/${paths.journeySlug}`
  if (section === undefined || section === 'story') {
    return base
  }
  return `${base}?section=${section}`
}

export function buildPublicMomentPath(
  paths: PublicJourneyPaths,
  entrySlug: string,
): string {
  return `/${paths.spaceHandle}/${paths.journeySlug}/${entrySlug}`
}

export function buildPublicSpacePath(spaceHandle: string): string {
  return `/${spaceHandle}`
}

export function buildAbsoluteUrl(path: string): string {
  return buildAppAbsoluteUrl(path)
}

export { buildSharePreviewUrl }
