import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { Suspense } from 'react'
import { z } from 'zod'
import {
  LazyAuthPage,
  LazyCreateEntryPage,
  LazyCreateJourneyPage,
  LazyCreateJourneyMemoryRoutePage,
  LazyDashboardPage,
  LazyEntryRoutePage,
  LazyJourneyMembersRoutePage,
  LazyJourneyRoutePage,
  LazyProfileRoutePage,
  LazySettingsRoutePage,
  LazySpacesRoutePage,
  LazySpaceMembersRoutePage,
  LazyAcceptInviteRoutePage,
  LazyAcceptJourneyInviteRoutePage,
  LazyPublicJourneyEntryRoutePage,
  LazyPublicJourneyRoutePage,
  LazyPublicSpaceRoutePage,
  LazyPublicStandaloneEntryRoutePage,
} from '@/app/lazy-pages'
import { AppShell } from '@/app/AppShell'
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

const createEntryRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/entries/new',
  component: LazyCreateEntryPage,
})

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/e/$entryId',
  validateSearch: (search) =>
    z
      .object({
        notice: z.enum(['photos_failed']).optional(),
        returnTo: z.string().optional(),
      })
      .parse(search),
  component: LazyEntryRoutePage,
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
  validateSearch: (search) =>
    z
      .object({
        notice: z.enum(['photos_failed']).optional(),
        section: z
          .enum(['overview', 'map', 'gallery', 'more', 'story', 'guides'])
          .optional(),
      })
      .parse(search),
  component: LazyJourneyRoutePage,
})

const createJourneyMemoryRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId/memory/new',
  validateSearch: (search) =>
    z
      .object({
        natureGoalId: z.uuid().optional(),
      })
      .parse(search),
  component: LazyCreateJourneyMemoryRoutePage,
})

const journeyMembersRoute = createRoute({
  beforeLoad: requireAuth,
  getParentRoute: () => rootRoute,
  path: '/j/$journeyId/members',
  component: LazyJourneyMembersRoutePage,
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

const publicSpaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$spaceHandle',
  component: LazyPublicSpaceRoutePage,
})

const publicJourneyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$spaceHandle/$journeySlug',
  component: LazyPublicJourneyRoutePage,
  validateSearch: z.object({
    section: z
      .enum(['overview', 'story', 'map', 'gallery', 'collections', 'guides'])
      .optional(),
  }),
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
  createJourneyMemoryRoute,
  journeyMembersRoute,
  spacesRoute,
  spaceMembersRoute,
  acceptInviteRoute,
  acceptJourneyInviteRoute,
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
