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

export const LazyCreateEntryPage = lazy(() =>
  import('@/pages/entry/CreateEntryPage').then(({ CreateEntryPage }) => ({
    default: CreateEntryPage,
  })),
)

export const LazyEntryRoutePage = lazy(() =>
  import('@/pages/entry/EntryRoutePage').then(({ EntryRoutePage }) => ({
    default: EntryRoutePage,
  })),
)
