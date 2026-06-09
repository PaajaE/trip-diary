import { MapPinned, Plus, WifiOff } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button'

export function HomePage() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-5 pb-10 pt-6 sm:px-8 sm:pt-10">
      <header className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-wide">
          {t('brand')}
        </span>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full bg-surface px-3 py-2 text-xs text-muted shadow-soft sm:flex">
            <WifiOff aria-hidden="true" size={14} />
            {t('home.status')}
          </span>
          <Link
            className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-primary hover:bg-surface"
            to="/sign-in"
          >
            {t('home.signIn')}
          </Link>
        </div>
      </header>

      <section className="my-auto py-20 sm:max-w-3xl">
        <p className="mb-5 text-sm font-medium text-accent">
          {t('home.eyebrow')}
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-6xl">
          {t('home.title')}
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg">
          {t('home.description')}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Button>
            <Plus aria-hidden="true" size={18} />
            {t('home.primaryAction')}
          </Button>
          <Button variant="secondary">
            <MapPinned aria-hidden="true" size={18} />
            {t('home.secondaryAction')}
          </Button>
        </div>
      </section>
    </main>
  )
}
