export type AuthGuardKind = 'app' | 'auth'

export type AuthNavigationDecision =
  | { type: 'loading' }
  | { type: 'redirect'; href: '/sign-in' | '/' }
  | { type: 'render' }

export function resolveAuthNavigation(input: {
  authLoading: boolean
  guard: AuthGuardKind
  session: unknown
}): AuthNavigationDecision {
  if (input.authLoading) {
    return { type: 'loading' }
  }

  if (input.guard === 'app' && input.session === null) {
    return { type: 'redirect', href: '/sign-in' }
  }

  if (input.guard === 'auth' && input.session !== null) {
    return { type: 'redirect', href: '/' }
  }

  return { type: 'render' }
}
