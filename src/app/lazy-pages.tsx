import { lazy } from 'react'

export const LazyAuthPage = lazy(() =>
  import('@/pages/auth/AuthPage').then(({ AuthPage }) => ({
    default: AuthPage,
  })),
)

export const LazyDashboardPage = lazy(() =>
  import('@/pages/dashboard/DashboardPage').then(({ DashboardPage }) => ({
    default: DashboardPage,
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

export const LazyCreateJourneyPage = lazy(() =>
  import('@/pages/journey/CreateJourneyPage').then(({ CreateJourneyPage }) => ({
    default: CreateJourneyPage,
  })),
)

export const LazyJourneyRoutePage = lazy(() =>
  import('@/pages/journey/JourneyRoutePage').then(({ JourneyRoutePage }) => ({
    default: JourneyRoutePage,
  })),
)
