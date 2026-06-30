const JOURNEY_SECTION_NAV_ID = 'journey-section-nav'

export function scrollToJourneySectionNav(): void {
  requestAnimationFrame(() => {
    const element = document.getElementById(JOURNEY_SECTION_NAV_ID)
    if (element === null || typeof element.scrollIntoView !== 'function') {
      return
    }

    element.scrollIntoView({
      behavior: 'auto',
      block: 'start',
    })
  })
}

export { JOURNEY_SECTION_NAV_ID }
