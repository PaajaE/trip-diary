const storageKey = 'trip-diary.active-space'

export function getActiveSpaceId(availableIds: string[]): string {
  const stored = localStorage.getItem(storageKey)
  return stored !== null && availableIds.includes(stored)
    ? stored
    : (availableIds[0] ?? '')
}

export function setActiveSpaceId(spaceId: string) {
  localStorage.setItem(storageKey, spaceId)
}
