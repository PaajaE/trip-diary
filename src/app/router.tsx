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
