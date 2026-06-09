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
  LazyEntryRoutePage,
  LazyProfileRoutePage,
} from '@/app/lazy-pages'
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
      <Outlet />
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  profileRoute,
  createEntryRoute,
  entryRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
