import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { Capacitor } from '@capacitor/core'
import { Suspense } from 'react'
import {
  LazyAuthPage,
  LazyCreateJourneyPage,
  LazyDashboardPage,
  LazyJourneyImportRoutePage,
  LazyJourneyMembersRoutePage,
  LazyJourneyRoutePage,
  LazyJourneyTrashRoutePage,
  LazyJourneyWorkspaceDayRoutePage,
  LazyJourneyWorkspaceRoutePage,
  LazyMediaLibraryDiagnosticsPage,
  LazyVideoUploadDevPage,
  LazyMediaUploadDevPage,
  LazyProfileRoutePage,
  LazySettingsRoutePage,
  LazyJourneyQuickNoteRoutePage,
  LazySpacesRoutePage,
  LazyTipsRoutePage,
  LazySpaceMembersRoutePage,
  LazyAcceptInviteRoutePage,
  LazyAcceptJourneyInviteRoutePage,
  LazyPublicJourneyRoutePage,
  LazyPublicMomentRoutePage,
  LazyPublicSegmentRoutePage,
  LazyPublicSpaceRoutePage,
} from '@/app/lazy-pages'
import { AppShell } from '@/app/AppShell'
import { optionalEnum, optionalFlag, searchSchema } from '@/app/search-params'
import { requireAuth } from '@/features/auth/routing/require-auth'
import { HomePage } from '@/pages/home/HomePage'

const rootRoute = createRootRoute({
  component: () => (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-5 py-16 text-muted">
          Trip Diary
        </main>
      }
    >
      <AppShell>
        <Outlet />
      </AppShell>
    </Suspense>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-2xl font-semibold">Page not found</h1>
    </main>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: () => <LazyAuthPage mode="signIn" />,
})

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  component: () => <LazyAuthPage mode="signUp" />,
})

const dashboardRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: LazyDashboardPage,
})

const settingsRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/settings/profile',
  component: LazySettingsRoutePage,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$username',
  component: LazyProfileRoutePage,
})

const createJourneyRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/journeys/new',
  component: LazyCreateJourneyPage,
})

const journeyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId',
  component: LazyJourneyRoutePage,
})

const journeyMembersRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId/members',
  component: LazyJourneyMembersRoutePage,
})

// v2 read-only workspace (timeline + map); v1 journey routes are untouched.
const journeyWorkspaceRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId/workspace',
  component: LazyJourneyWorkspaceRoutePage,
  // ?map=full opens the map over the whole workspace; Back closes it.
  validateSearch: searchSchema({ map: optionalEnum(['full'] as const) }),
})

// Day page of the workspace: full-screen panel with its own address.
const journeyWorkspaceDayRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId/workspace/day/$date',
  component: LazyJourneyWorkspaceDayRoutePage,
  // ?cull=true opens the day straight in culling ("Výběr nejlepších").
  validateSearch: searchSchema({ cull: optionalFlag() }),
})

const journeyTrashRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId/trash',
  component: LazyJourneyTrashRoutePage,
})

const journeyImportRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId/import',
  component: LazyJourneyImportRoutePage,
})

const tipsRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/tips',
  component: LazyTipsRoutePage,
})

const journeyQuickNoteRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId/quick',
  component: LazyJourneyQuickNoteRoutePage,
})

const spacesRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/spaces',
  component: LazySpacesRoutePage,
})

const spaceMembersRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/spaces/$spaceId/members',
  component: LazySpaceMembersRoutePage,
})

const acceptInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: LazyAcceptInviteRoutePage,
})

const acceptJourneyInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/journey-invite/$token',
  component: LazyAcceptJourneyInviteRoutePage,
})

// Developer diagnostics exist only in the native app (opened via
// tripdiary://app/dev/media-library); on the web the path is not routed.
const mediaLibraryDiagnosticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/media-library',
  component: LazyMediaLibraryDiagnosticsPage,
})

// Native-only video upload harness (T7b); never routed on the web.
const videoUploadDevRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/video-upload',
  component: LazyVideoUploadDevPage,
})

// Phase 2 upload harness: web dev builds only (never routed in production).
const mediaUploadDevRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/media-upload',
  component: LazyMediaUploadDevPage,
})

const publicSpaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$spaceHandle',
  component: LazyPublicSpaceRoutePage,
})

const publicJourneyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$spaceHandle/$journeySlug',
  component: LazyPublicJourneyRoutePage,
  validateSearch: searchSchema({
    section: optionalEnum(['story', 'map', 'gallery', 'collections', 'guides']),
  }),
})

const publicSegmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$spaceHandle/$journeySlug/e/$segmentId',
  component: LazyPublicSegmentRoutePage,
})

const publicMomentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$spaceHandle/$journeySlug/m/$momentId',
  component: LazyPublicMomentRoutePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  dashboardRoute,
  settingsRoute,
  profileRoute,
  createJourneyRoute,
  journeyRoute,
  journeyMembersRoute,
  journeyWorkspaceRoute,
  journeyWorkspaceDayRoute,
  journeyTrashRoute,
  journeyImportRoute,
  journeyQuickNoteRoute,
  spacesRoute,
  tipsRoute,
  spaceMembersRoute,
  acceptInviteRoute,
  acceptJourneyInviteRoute,
  ...(Capacitor.isNativePlatform()
    ? [mediaLibraryDiagnosticsRoute, videoUploadDevRoute]
    : []),
  ...(import.meta.env.DEV && !Capacitor.isNativePlatform()
    ? [mediaUploadDevRoute]
    : []),
  publicSpaceRoute,
  publicJourneyRoute,
  publicSegmentRoute,
  publicMomentRoute,
])

export const router = createRouter({
  basepath: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  routeTree,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
