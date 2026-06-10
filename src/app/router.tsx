import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { Suspense } from 'react'
import {
  LazyAuthPage,
  LazyCreateEntryPage,
  LazyCreateJourneyPage,
  LazyDashboardPage,
  LazyEntryRoutePage,
  LazyJourneyRoutePage,
  LazyProfileRoutePage,
  LazySettingsRoutePage,
  LazySpacesRoutePage,
  LazySpaceMembersRoutePage,
  LazyAcceptInviteRoutePage,
  LazyPublicJourneyEntryRoutePage,
  LazyPublicJourneyRoutePage,
  LazyPublicSpaceRoutePage,
  LazyPublicStandaloneEntryRoutePage,
} from '@/app/lazy-pages'
import { AppShell } from '@/app/AppShell'
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
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: LazyDashboardPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/profile',
  component: LazySettingsRoutePage,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$username',
  component: LazyProfileRoutePage,
})

const createEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entries/new',
  component: LazyCreateEntryPage,
})

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/e/$entryId',
  component: LazyEntryRoutePage,
})

const createJourneyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/journeys/new',
  component: LazyCreateJourneyPage,
})

const journeyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId',
  component: LazyJourneyRoutePage,
})

const spacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/spaces',
  component: LazySpacesRoutePage,
})

const spaceMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/spaces/$spaceId/members',
  component: LazySpaceMembersRoutePage,
})

const acceptInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: LazyAcceptInviteRoutePage,
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
})

const publicStandaloneEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$spaceHandle/tipy/$entrySlug',
  component: LazyPublicStandaloneEntryRoutePage,
})

const publicJourneyEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$spaceHandle/$journeySlug/$entrySlug',
  component: LazyPublicJourneyEntryRoutePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  dashboardRoute,
  settingsRoute,
  profileRoute,
  createEntryRoute,
  entryRoute,
  createJourneyRoute,
  journeyRoute,
  spacesRoute,
  spaceMembersRoute,
  acceptInviteRoute,
  publicSpaceRoute,
  publicJourneyRoute,
  publicStandaloneEntryRoute,
  publicJourneyEntryRoute,
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
