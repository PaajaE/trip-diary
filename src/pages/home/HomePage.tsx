import { Camera, Layers, MapPinned, PenLine } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { buttonVariants } from '@/shared/ui/button-variants'
import { LandingFooter } from '@/pages/home/LandingFooter'
import { RouteIllustration } from '@/pages/home/RouteIllustration'
import { SoonBadge } from '@/pages/home/SoonBadge'
import { StructureExample } from '@/pages/home/StructureExample'

const STEPS = [
  { key: 'capture', icon: Camera, soon: false },
  { key: 'place', icon: Layers, soon: true },
  { key: 'share', icon: PenLine, soon: false },
] as const

const AUDIENCE = ['family', 'friends', 'long', 'treks'] as const
const PHOTOS = [
  { key: 'road', src: '/landing/road.webp' },
  { key: 'lake', src: '/landing/lake.webp' },
  { key: 'desk', src: '/landing/desk.webp' },
] as const
const EXTRAS = ['publicPage', 'tips', 'tags'] as const

const sectionClass = 'scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24'
const eyebrowClass =
  'text-[0.6875rem] font-semibold tracking-[0.18em] text-accent-strong uppercase'
const h2Class =
  'reader-display mt-3 text-3xl leading-[1.1] tracking-[-0.03em] sm:text-4xl'

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useSession()
  const signedIn = user !== null

  useDocumentMeta({
    description: t('home.meta.description'),
    title: t('home.meta.title'),
  })

  const primaryCta = (
    <Link
      className={buttonVariants({ variant: 'primary' })}
      to={signedIn ? '/journeys/new' : '/sign-in'}
    >
      <MapPinned aria-hidden="true" size={18} />
      {signedIn ? t('home.primaryAction') : t('home.signIn')}
    </Link>
  )

  return (
    <>
      <main className="overflow-x-clip">
        <section className="mx-auto grid w-full max-w-5xl gap-10 px-5 pt-10 pb-16 sm:px-8 sm:pt-16 sm:pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className={eyebrowClass}>{t('home.eyebrow')}</p>
            <h1 className="reader-display mt-5 text-4xl leading-[1.05] tracking-[-0.04em] sm:text-6xl">
              {t('home.title')}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg">
              {t('home.description')}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              {primaryCta}
              {signedIn ? (
                <Link
                  className={buttonVariants({ variant: 'secondary' })}
                  to="/dashboard"
                >
                  {t('home.myTrips')}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={`${buttonVariants({ variant: 'secondary' })} cursor-default gap-3`}
                >
                  {t('home.demo')}
                  <SoonBadge />
                </span>
              )}
            </div>
            <p className="mt-5 max-w-md text-xs leading-5 text-muted">
              {t('home.soonNote')}
            </p>
          </div>
          <RouteIllustration
            className="mx-auto w-full max-w-md lg:max-w-none"
            title={t('home.illustrationLabel')}
          />
        </section>

        <section
          className={`${sectionClass} bg-surface/60`}
          id="jak-to-funguje"
        >
          <div className="mx-auto max-w-5xl">
            <h2 className={h2Class}>{t('home.how.title')}</h2>
            <p className="mt-4 text-base text-muted">{t('home.how.intro')}</p>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, key, soon }, index) => (
                <li
                  className="rounded-3xl border border-border/80 bg-surface p-6 shadow-soft"
                  key={key}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon aria-hidden="true" size={20} />
                    </span>
                    <span className="reader-display text-3xl text-border">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {t(`home.how.steps.${key}.title`)}
                    {soon ? <SoonBadge /> : null}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {t(`home.how.steps.${key}.body`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={sectionClass} id="struktura">
          <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className={h2Class}>{t('home.structure.title')}</h2>
              <p className="mt-5 text-base leading-7 text-muted">
                {t('home.structure.intro')}
              </p>
              <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
                <SoonBadge />
                {t('home.structure.autoNote')}
              </p>
            </div>
            <StructureExample />
          </div>
        </section>

        <section className={`${sectionClass} bg-surface/60`}>
          <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-center">
            <div className="order-2 lg:order-1">
              <MapTimeline />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className={h2Class}>{t('home.map.title')}</h2>
              <p className="mt-5 text-base leading-7 text-muted">
                {t('home.map.body')}
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {(['exif', 'timezone', 'manual'] as const).map((key) => (
                  <li className="flex items-start gap-3" key={key}>
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                    />
                    <span>{t(`home.map.points.${key}`)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5">
                <SoonBadge />
              </p>
            </div>
          </div>
        </section>

        <section className="px-5 pt-4 pb-4 sm:px-8">
          <div className="mx-auto max-w-5xl">
            <ul className="grid gap-5 md:grid-cols-3">
              {PHOTOS.map(({ key, src }) => (
                <li key={key}>
                  <figure>
                    <img
                      alt={t(`home.gallery.${key}.alt`)}
                      className="aspect-[4/3] w-full rounded-3xl object-cover"
                      decoding="async"
                      height={600}
                      loading="lazy"
                      src={src}
                      width={800}
                    />
                    <figcaption className="mt-3 text-sm text-muted">
                      {t(`home.gallery.${key}.caption`)}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{t('home.gallery.note')}</p>
          </div>
        </section>

        <section className={sectionClass} id="pro-koho">
          <div className="mx-auto max-w-5xl">
            <h2 className={h2Class}>{t('home.audience.title')}</h2>
            <p className="mt-4 text-base text-muted">
              {t('home.audience.intro')}
            </p>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2">
              {AUDIENCE.map((key) => (
                <li
                  className="rounded-3xl border border-border/80 bg-surface p-6"
                  key={key}
                >
                  <h3 className="reader-display text-xl">
                    {t(`home.audience.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {t(`home.audience.${key}.body`)}
                  </p>
                </li>
              ))}
            </ul>
            <h3 className="mt-14 text-sm font-semibold tracking-wide text-muted uppercase">
              {t('home.audience.extras.title')}
            </h3>
            <ul className="mt-4 grid gap-5 md:grid-cols-3">
              {EXTRAS.map((key) => (
                <li
                  className="rounded-3xl border border-dashed border-border bg-surface/60 p-6"
                  key={key}
                >
                  <h4 className="flex flex-wrap items-center gap-2 font-semibold">
                    {t(`home.audience.extras.${key}.title`)}
                    <SoonBadge />
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {t(`home.audience.extras.${key}.body`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8 sm:pb-28">
          <div className="mx-auto max-w-5xl rounded-[2rem] bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
            <h2 className="reader-display text-3xl leading-[1.1] tracking-[-0.03em] sm:text-4xl">
              {t('home.closing.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-7 text-primary-foreground/85">
              {t('home.closing.body')}
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                className={buttonVariants({ variant: 'secondary' })}
                to={signedIn ? '/journeys/new' : '/sign-in'}
              >
                {signedIn ? t('home.primaryAction') : t('home.signIn')}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}

function MapTimeline() {
  const { t } = useTranslation()
  const times = [
    t('home.map.axisStart'),
    t('home.map.axisMid'),
    t('home.map.axisEnd'),
  ]

  return (
    <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <RouteIllustration
        className="mx-auto w-full max-w-sm"
        numbered
        title={t('home.map.illustrationLabel')}
      />
      <ol
        aria-hidden="true"
        className="flex justify-between gap-4 border-t border-border pt-4 sm:flex-col sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5"
      >
        {times.map((time, index) => (
          <li className="flex items-center gap-2" key={time}>
            <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
              {index + 1}
            </span>
            <span className="text-sm font-semibold tabular-nums">{time}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
