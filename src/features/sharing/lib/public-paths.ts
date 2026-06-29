import type { JourneyReaderSection } from '@/features/journeys/ui/JourneyReaderSectionTabs'

export interface PublicJourneyPaths {
  journeySlug: string
  spaceHandle: string
}

export function buildPublicJourneyPath(
  paths: PublicJourneyPaths,
  section?: JourneyReaderSection,
): string {
  const base = `/${paths.spaceHandle}/${paths.journeySlug}`
  if (section === undefined || section === 'overview') {
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
  if (typeof window === 'undefined') {
    return path
  }
  return new URL(path, window.location.origin).href
}
