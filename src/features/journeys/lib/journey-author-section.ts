export type JourneyAuthorSection = 'story'

export const JOURNEY_AUTHOR_SECTION_IDS: Record<JourneyAuthorSection, string> =
  {
    story: 'story',
  }

const DEFAULT_SCROLL_OFFSET = 96

export function scrollToJourneyAuthorSection(section: JourneyAuthorSection) {
  const id = JOURNEY_AUTHOR_SECTION_IDS[section]
  const element = document.getElementById(id)
  if (element === null) {
    return
  }

  const style = getComputedStyle(element)
  const scrollMarginTop =
    Number.parseFloat(style.scrollMarginTop) || DEFAULT_SCROLL_OFFSET
  const top =
    element.getBoundingClientRect().top + window.scrollY - scrollMarginTop

  window.scrollTo({
    behavior: 'smooth',
    top: Math.max(0, top),
  })
}

export function scrollToJourneyMoment(entryId: string) {
  scrollToJourneyAuthorSection('story')
  window.requestAnimationFrame(() => {
    const element = document.getElementById(`moment-${entryId}`)
    if (element === null) {
      return
    }
    element.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'center',
    })
  })
}

/** Legacy `?section=` values from older authoring layouts. */
export function isLegacyAuthorSectionParam(
  value: string | undefined,
): value is 'gallery' | 'map' | 'overview' {
  return value === 'map' || value === 'gallery' || value === 'overview'
}
