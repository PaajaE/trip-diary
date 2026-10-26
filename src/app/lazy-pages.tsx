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

export const LazyJourneyMembersRoutePage = lazy(() =>
  import('@/pages/journey/JourneyMembersRoutePage').then(
    ({ JourneyMembersRoutePage }) => ({ default: JourneyMembersRoutePage }),
  ),
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

export const LazyAcceptJourneyInviteRoutePage = lazy(() =>
  import('@/pages/journey/AcceptJourneyInviteRoutePage').then(
    ({ AcceptJourneyInviteRoutePage }) => ({
      default: AcceptJourneyInviteRoutePage,
    }),
  ),
)

export const LazyPublicSpaceRoutePage = lazy(() =>
  import('@/pages/public-space/PublicSpaceRoutePage').then(
    ({ PublicSpaceRoutePage }) => ({ default: PublicSpaceRoutePage }),
  ),
)

export const LazyPublicJourneyRoutePage = lazy(() =>
  import('@/pages/public-journey/PublicJourneyRoutePages').then(
    ({ PublicJourneyRoutePage }) => ({ default: PublicJourneyRoutePage }),
  ),
)

export const LazyPublicSegmentRoutePage = lazy(() =>
  import('@/pages/public-journey/PublicJourneyRoutePages').then(
    ({ PublicSegmentRoutePage }) => ({ default: PublicSegmentRoutePage }),
  ),
)

export const LazyPublicMomentRoutePage = lazy(() =>
  import('@/pages/public-journey/PublicJourneyRoutePages').then(
    ({ PublicMomentRoutePage }) => ({ default: PublicMomentRoutePage }),
  ),
)

export const LazyMediaLibraryDiagnosticsPage = lazy(() =>
  import('@/pages/dev/MediaLibraryDiagnosticsPage').then(
    ({ MediaLibraryDiagnosticsPage }) => ({
      default: MediaLibraryDiagnosticsPage,
    }),
  ),
)

export const LazyVideoUploadDevPage = lazy(() =>
  import('@/pages/dev/VideoUploadDevPage').then(({ VideoUploadDevPage }) => ({
    default: VideoUploadDevPage,
  })),
)

export const LazyMediaUploadDevPage = lazy(() =>
  import('@/pages/dev/MediaUploadDevPage').then(({ MediaUploadDevPage }) => ({
    default: MediaUploadDevPage,
  })),
)

export const LazyJourneyImportRoutePage = lazy(() =>
  import('@/pages/journey/JourneyImportRoutePage').then(
    ({ JourneyImportRoutePage }) => ({ default: JourneyImportRoutePage }),
  ),
)

export const LazyJourneyBatchRoutePage = lazy(() =>
  import('@/pages/journey/JourneyBatchRoutePage').then(
    ({ JourneyBatchRoutePage }) => ({ default: JourneyBatchRoutePage }),
  ),
)

export const LazyJourneyWorkspaceRoutePage = lazy(() =>
  import('@/pages/journey/JourneyWorkspaceRoutePage').then(
    ({ JourneyWorkspaceRoutePage }) => ({
      default: JourneyWorkspaceRoutePage,
    }),
  ),
)

export const LazyJourneyWorkspaceDayRoutePage = lazy(() =>
  import('@/pages/journey/JourneyWorkspaceDayRoutePage').then(
    ({ JourneyWorkspaceDayRoutePage }) => ({
      default: JourneyWorkspaceDayRoutePage,
    }),
  ),
)

export const LazyJourneyTrashRoutePage = lazy(() =>
  import('@/pages/journey/JourneyTrashRoutePage').then(
    ({ JourneyTrashRoutePage }) => ({ default: JourneyTrashRoutePage }),
  ),
)

export const LazyTipsRoutePage = lazy(() =>
  import('@/pages/tips/TipsRoutePage').then(({ TipsRoutePage }) => ({
    default: TipsRoutePage,
  })),
)

export const LazyJourneyQuickNoteRoutePage = lazy(() =>
  import('@/pages/journey/JourneyQuickNoteRoutePage').then(
    ({ JourneyQuickNoteRoutePage }) => ({ default: JourneyQuickNoteRoutePage }),
  ),
)
