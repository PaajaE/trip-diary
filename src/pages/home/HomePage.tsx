import { MapPinned, Plus } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function HomePage() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-5 pb-10 pt-6 sm:px-8 sm:pt-10">
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
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            to="/entries/new"
          >
            <Plus aria-hidden="true" size={18} />
            {t('home.primaryAction')}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 text-sm font-semibold transition-colors hover:bg-white"
            to="/journeys/new"
          >
            <MapPinned aria-hidden="true" size={18} />
            {t('home.secondaryAction')}
          </Link>
        </div>
      </section>
    </main>
  )
}
