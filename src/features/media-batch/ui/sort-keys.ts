/** Typing into a field: sorting shortcuts must not fire. */
export function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  )
}

/** Keys the sorting shortcuts leave alone (modifiers, text fields). */
export function ignoredKey(event: KeyboardEvent): boolean {
  return (
    event.ctrlKey || event.metaKey || event.altKey || isTextTarget(event.target)
  )
}

/** A focused button or link keeps its own Enter and Space. */
export function isControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'BUTTON' || target.tagName === 'A')
  )
}
