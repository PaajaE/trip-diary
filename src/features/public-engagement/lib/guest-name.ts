const KEY = 'trip-diary:guest-name'

export function loadGuestName(): string {
  try {
    return window.localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveGuestName(name: string): void {
  try {
    window.localStorage.setItem(KEY, name)
  } catch {
    // Private mode or blocked storage: the name just is not remembered.
  }
}
