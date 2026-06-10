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

export const LazySettingsRoutePage = lazy(() =>
  import('@/pages/settings/SettingsRoutePage').then(
    ({ SettingsRoutePage }) => ({
      default: SettingsRoutePage,
    }),
  ),
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

export const LazySpacesRoutePage = lazy(() =>
  import('@/pages/spaces/SpacesRoutePage').then(({ SpacesRoutePage }) => ({
    default: SpacesRoutePage,
  })),
)

export const LazySpaceMembersRoutePage = lazy(() =>
  import('@/pages/spaces/SpaceMembersRoutePage').then(
    ({ SpaceMembersRoutePage }) => ({ default: SpaceMembersRoutePage }),
  ),
)

export const LazyAcceptInviteRoutePage = lazy(() =>
  import('@/pages/spaces/AcceptInviteRoutePage').then(
    ({ AcceptInviteRoutePage }) => ({ default: AcceptInviteRoutePage }),
  ),
)
