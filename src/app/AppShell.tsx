import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { LogOut, MapPinned } from 'lucide-react'
import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { isPublicSharePath } from '@/features/sharing/lib/is-public-share-path'
import { isPublicReaderPath } from '@/features/sharing/lib/is-public-reader-path'
import { SyncStatusControl } from '@/features/sync/ui/SyncStatusControl'
import { Avatar } from '@/shared/ui/Avatar'

export function AppShell({ children }: PropsWithChildren) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loading, profile, signOut, user } = useSession()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const minimalPublicShell = isPublicSharePath(pathname)
  const immersiveReaderShell = isPublicReaderPath(pathname)
  const identity =
    profile?.displayName ?? profile?.username ?? user?.email ?? t('brand')

  return (
    <>
      {immersiveReaderShell ? null : (
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 px-5 backdrop-blur sm:px-8">
          <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4">
            <Link className="text-sm font-semibold tracking-wide" to="/">
              {t('brand')}
            </Link>
            <nav
              aria-label={t('navigation.account')}
              className="flex items-center gap-2"
            >
              {minimalPublicShell ? null : <SyncStatusControl />}
              {loading ? (
                <span
                  aria-label={t('navigation.loading')}
                  className="size-10 animate-pulse rounded-full bg-surface"
                />
              ) : user === null ? (
                <Link
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary hover:bg-surface"
                  to="/sign-in"
                >
                  {t('home.signIn')}
                </Link>
              ) : (
                <>
                  <Link
                    aria-label={t('navigation.newTrip')}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-primary hover:bg-surface"
                    to="/journeys/new"
                  >
                    <MapPinned aria-hidden="true" size={17} />
                    <span className="hidden sm:inline">
                      {t('navigation.newTrip')}
                    </span>
                  </Link>
                  <AccountMenu
                    identity={identity}
                    profile={profile}
                    signOut={() =>
                      void signOut().then(() => navigate({ to: '/' }))
                    }
                  />
                </>
              )}
            </nav>
          </div>
        </header>
      )}
      {children}
    </>
  )
}

function AccountMenu({
  identity,
  profile,
  signOut,
}: {
  identity: string
  profile: ReturnType<typeof useSession>['profile']
  signOut: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('navigation.accountMenu', { name: identity })}
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full focus-visible:outline"
        onClick={() => {
          setOpen((current) => !current)
        }}
        type="button"
      >
        <Avatar label={identity} src={profile?.avatarUrl} />
        <span className="hidden max-w-40 truncate text-sm font-semibold sm:block">
          {identity}
        </span>
      </button>
      {open ? (
        <div
          className="absolute right-0 mt-2 w-56 rounded-xl border border-border/80 bg-surface p-2 shadow-soft"
          role="menu"
        >
          <Link
            className="block rounded-sm px-3 py-3 text-sm font-semibold hover:bg-background"
            onClick={() => {
              setOpen(false)
            }}
            to="/dashboard"
          >
            {t('navigation.dashboard')}
          </Link>
          {profile === null ? null : (
            <Link
              className="block rounded-sm px-3 py-3 text-sm font-semibold hover:bg-background"
              onClick={() => {
                setOpen(false)
              }}
              params={{ username: profile.username }}
              to="/u/$username"
            >
              {t('navigation.profile')}
            </Link>
          )}
          <Link
            className="block rounded-sm px-3 py-3 text-sm font-semibold hover:bg-background"
            onClick={() => {
              setOpen(false)
            }}
            to="/settings/profile"
          >
            {t('navigation.settings')}
          </Link>
          <Link
            className="block rounded-sm px-3 py-3 text-sm font-semibold hover:bg-background"
            onClick={() => {
              setOpen(false)
            }}
            to="/entries/new"
          >
            {t('navigation.quickNote')}
          </Link>
          <Link
            className="block rounded-sm px-3 py-3 text-sm font-semibold hover:bg-background"
            onClick={() => {
              setOpen(false)
            }}
            to="/spaces"
          >
            {t('navigation.spaces')}
          </Link>
          <button
            className="flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-semibold text-destructive hover:bg-background"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
            {t('navigation.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
