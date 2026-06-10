const storageKey = 'trip-diary.auth-return'

export function storeAuthReturnPath(path: string) {
  if (path.startsWith('/') && !path.startsWith('//')) {
    sessionStorage.setItem(storageKey, path)
  }
}

export function consumeAuthReturnPath(): string | null {
  const path = sessionStorage.getItem(storageKey)
  sessionStorage.removeItem(storageKey)
  return path !== null && path.startsWith('/') && !path.startsWith('//')
    ? path
    : null
}
