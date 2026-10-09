import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { LanguageSwitcher } from '@/app/LanguageSwitcher'
import { useSession } from '@/features/auth/session'

export function LandingFooter() {
  const { t } = useTranslation()
  const { user } = useSession()
  const linkClass =
    'inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground'

  return (
    <footer className="border-t border-border/70 px-5 pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 sm:flex-row sm:justify-between">
        <div className="max-w-xs">
          <p className="reader-display text-xl">{t('brand')}</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t('home.footer.tagline')}
          </p>
        </div>
        <nav
          aria-label={t('home.footer.navigation')}
          className="flex flex-col sm:items-end"
        >
          <a className={linkClass} href="#jak-to-funguje">
            {t('home.footer.how')}
          </a>
          <a className={linkClass} href="#struktura">
            {t('home.footer.structure')}
          </a>
          <a className={linkClass} href="#pro-koho">
            {t('home.footer.audience')}
          </a>
          {user === null ? (
            <Link className={linkClass} to="/sign-in">
              {t('home.signIn')}
            </Link>
          ) : (
            <Link className={linkClass} to="/dashboard">
              {t('home.myTrips')}
            </Link>
          )}
        </nav>
      </div>
      <div className="mx-auto mt-8 flex max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
        <p className="text-xs text-muted">
          © {new Date().getFullYear()} {t('brand')}. {t('home.footer.rights')}
        </p>
        {user === null ? <LanguageSwitcher /> : null}
      </div>
    </footer>
  )
}
