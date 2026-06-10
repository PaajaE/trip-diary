import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut, Plus, WifiOff } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { Avatar } from '@/shared/ui/Avatar'

export function AppShell({ children }: PropsWithChildren) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loading, profile, signOut, user } = useSession()
  const identity =
    profile?.displayName ?? profile?.username ?? user?.email ?? t('brand')

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 px-5 backdrop-blur sm:px-8">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4">
          <Link className="text-sm font-semibold tracking-wide" to="/">
            {t('brand')}
          </Link>
          <nav
            aria-label={t('navigation.account')}
            className="flex items-center gap-2"
          >
            <span className="hidden items-center gap-2 rounded-full bg-surface px-3 py-2 text-xs text-muted shadow-soft sm:flex">
              <WifiOff aria-hidden="true" size={14} />
              {t('home.status')}
            </span>
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
                  aria-label={t('navigation.addMemory')}
                  className="hidden min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-primary hover:bg-surface sm:inline-flex"
                  to="/entries/new"
                >
                  <Plus aria-hidden="true" size={17} />
                  {t('navigation.addMemory')}
                </Link>
                <details className="group relative">
                  <summary
                    aria-label={t('navigation.accountMenu', {
                      name: identity,
                    })}
                    className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full focus-visible:outline [&::-webkit-details-marker]:hidden"
                  >
                    <Avatar label={identity} src={profile?.avatarUrl} />
                    <span className="hidden max-w-40 truncate text-sm font-semibold sm:block">
                      {identity}
                    </span>
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-surface p-2 shadow-soft">
                    <Link
                      className="block rounded-sm px-3 py-3 text-sm font-semibold hover:bg-background"
                      to="/dashboard"
                    >
                      {t('navigation.dashboard')}
                    </Link>
                    {profile === null ? null : (
                      <Link
                        className="block rounded-sm px-3 py-3 text-sm font-semibold hover:bg-background"
                        params={{ username: profile.username }}
                        to="/u/$username"
                      >
                        {t('navigation.profile')}
                      </Link>
                    )}
                    <Link
                      className="block rounded-sm px-3 py-3 text-sm font-semibold hover:bg-background"
                      to="/settings/profile"
                    >
                      {t('navigation.settings')}
                    </Link>
                    <button
                      className="flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-semibold text-destructive hover:bg-background"
                      onClick={() => {
                        void signOut().then(() => navigate({ to: '/' }))
                      }}
                      type="button"
                    >
                      <LogOut aria-hidden="true" size={16} />
                      {t('navigation.signOut')}
                    </button>
                  </div>
                </details>
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
    </>
  )
}
