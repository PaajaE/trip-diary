export type JourneyReaderSection =
  | 'story'
  | 'map'
  | 'gallery'
  | 'collections'
  | 'guides'

export const JOURNEY_READER_SECTION_IDS: Record<JourneyReaderSection, string> =
  {
    collections: 'reader-collections',
    gallery: 'reader-gallery',
    guides: 'reader-guides',
    map: 'reader-map',
    story: 'reader-story',
  }

/** Scroll anchors — may differ from section ids when a section is taller than the viewport. */
export const JOURNEY_READER_SCROLL_TARGETS: Record<
  JourneyReaderSection,
  string
> = {
  collections: JOURNEY_READER_SECTION_IDS.collections,
  gallery: JOURNEY_READER_SECTION_IDS.gallery,
  guides: JOURNEY_READER_SECTION_IDS.guides,
  map: 'reader-map-scroll',
  story: JOURNEY_READER_SECTION_IDS.story,
}

const DEFAULT_SCROLL_OFFSET = 96

export function scrollToReaderSection(section: JourneyReaderSection) {
  const id = JOURNEY_READER_SCROLL_TARGETS[section]
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
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    top: Math.max(0, top),
  })
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
