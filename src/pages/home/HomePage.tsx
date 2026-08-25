import { MapPinned, Plus } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { buttonVariants } from '@/shared/ui/button-variants'
import { cn } from '@/shared/lib/cn'

export function HomePage() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-5 pb-10 pt-6 sm:px-8 sm:pt-10">
      <section className="my-auto py-16 sm:max-w-3xl sm:py-20">
        <p className="mb-5 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent uppercase">
          {t('home.eyebrow')}
        </p>
        <h1 className="reader-display max-w-2xl text-4xl leading-[1.05] tracking-[-0.04em] sm:text-6xl">
          {t('home.title')}
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg">
          {t('home.description')}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            className={buttonVariants({ variant: 'primary' })}
            to="/journeys/new"
          >
            <MapPinned aria-hidden="true" size={18} />
            {t('home.primaryAction')}
          </Link>
          <Link
            className={cn(buttonVariants({ variant: 'secondary' }))}
            to="/entries/new"
          >
            <Plus aria-hidden="true" size={18} />
            {t('home.secondaryAction')}
          </Link>
        </div>
      </section>
    </main>
  )
}
