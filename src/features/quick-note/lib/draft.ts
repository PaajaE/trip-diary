const PREFIX = 'trip-diary.quick-note.'

/** Unsent text per journey, so a failed save or a closed app loses nothing. */
export function loadDraft(journeyId: string): string {
  try {
    return localStorage.getItem(PREFIX + journeyId) ?? ''
  } catch {
    return ''
  }
}

export function saveDraft(journeyId: string, text: string): void {
  try {
    if (text === '') localStorage.removeItem(PREFIX + journeyId)
    else localStorage.setItem(PREFIX + journeyId, text)
  } catch {
    // Storage may be unavailable (private mode); the text stays on screen.
  }
}
