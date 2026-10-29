import { Link, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const ITEM =
  'inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-primary hover:bg-surface focus-visible:outline'

/**
 * Slim top bar of the reading mode (public trip, stage and stop pages). The
 * app header is hidden there, so this is the way out: one level up, or leave
 * reading altogether. Sits below the iOS status bar (`--reader-bar-h`).
 */
export function ReaderBar({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const segments = pathname.split('/').filter(Boolean)
  const [spaceHandle, journeySlug] = segments
  if (spaceHandle === undefined) return null
  const onJourney = journeySlug === undefined || segments.length < 3
  return (
    <header
      aria-label={t('reader.bar')}
      className="sticky top-0 z-30 border-b border-border/60 bg-background/90 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] backdrop-blur"
    >
      <div className="mx-auto flex min-h-12 max-w-6xl items-center justify-between gap-2">
        {onJourney ? (
          <Link className={ITEM} params={{ spaceHandle }} to="/$spaceHandle">
            <ArrowLeft aria-hidden="true" size={17} />
            {t('reader.backToSpace')}
          </Link>
        ) : (
          <Link
            className={ITEM}
            params={{ journeySlug, spaceHandle }}
            to="/$spaceHandle/$journeySlug"
          >
            <ArrowLeft aria-hidden="true" size={17} />
            {t('reader.backToJourney')}
          </Link>
        )}
        {signedIn ? (
          <Link className={ITEM} to="/dashboard">
            <X aria-hidden="true" size={17} />
            {t('reader.exit')}
          </Link>
        ) : (
          <Link className={ITEM} params={{ spaceHandle }} to="/$spaceHandle">
            <X aria-hidden="true" size={17} />
            {t('reader.exit')}
          </Link>
        )}
      </div>
    </header>
  )
}
