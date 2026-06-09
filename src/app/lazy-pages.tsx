import { lazy } from 'react'

export const LazyAuthPage = lazy(() =>
  import('@/pages/auth/AuthPage').then(({ AuthPage }) => ({
    default: AuthPage,
  })),
)

export const LazyProfileRoutePage = lazy(() =>
  import('@/pages/profile/ProfileRoutePage').then(({ ProfileRoutePage }) => ({
    default: ProfileRoutePage,
  })),
)
