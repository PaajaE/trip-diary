import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import { cn } from '@/shared/lib/cn'

export type JourneyTab =
  | 'batch'
  | 'import'
  | 'members'
  | 'quick'
  | 'trash'
  | 'workspace'

const TAB_BASE =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors sm:-mb-px sm:rounded-none sm:border-b-2 sm:px-3'
const TAB_ACTIVE =
  'bg-primary/10 text-primary sm:border-primary sm:bg-transparent'
const TAB_IDLE =
  'text-muted hover:bg-surface hover:text-foreground sm:border-transparent sm:hover:bg-transparent'

/**
 * Journey-level navigation shown on every owner page of a journey: scrollable
 * pill row on narrow screens, underlined tabs from `sm`. The last entry is the
 * public page: a link when the journey is public, an explained disabled item
 * otherwise (`publicPaths` is null for "not public", undefined while unknown).
 */
export function JourneyTabs({
  batchCount = 0,
  current,
  journeyId,
  publicPaths,
}: {
  /** Media waiting to be sorted; the "Batch" tab shows a badge when > 0. */
  batchCount?: number
  current: JourneyTab
  journeyId: string
  publicPaths: PublicJourneyPaths | null | undefined
}) {
  const { t } = useTranslation()
  const tab = (key: JourneyTab) =>
    cn(TAB_BASE, current === key ? TAB_ACTIVE : TAB_IDLE)
  const aria = (key: JourneyTab) => (current === key ? 'page' : undefined)

  return (
    <nav
      aria-label={t('owner.tabsLabel')}
      className="-mx-5 mb-6 overflow-x-auto px-5 sm:mx-0 sm:mb-8 sm:border-b sm:border-border sm:px-0"
    >
      <ul className="flex w-max min-w-full items-center gap-1 pb-1 sm:pb-0">
        <li>
          <Link
            aria-current={aria('workspace')}
            className={tab('workspace')}
            params={{ journeyId }}
            to="/j/$journeyId/workspace"
          >
            {t('owner.tabs.workspace')}
          </Link>
        </li>
        <li>
          <Link
            aria-current={aria('import')}
            className={tab('import')}
            params={{ journeyId }}
            to="/j/$journeyId/import"
          >
            {t('owner.tabs.import')}
          </Link>
        </li>
        <li>
          <Link
            aria-current={aria('batch')}
            className={tab('batch')}
            params={{ journeyId }}
            to="/j/$journeyId/batch"
          >
            {t('owner.tabs.batch')}
            {batchCount > 0 ? (
              <>
                <span
                  aria-hidden="true"
                  className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-semibold leading-5 text-white"
                  data-testid="batch-badge"
                >
                  {batchCount > 99 ? '99+' : batchCount}
                </span>
                <span className="sr-only">
                  {t('mediaBatch.tabBadge', { count: batchCount })}
                </span>
              </>
            ) : null}
          </Link>
        </li>
        <li>
          <Link
            aria-current={aria('quick')}
            className={tab('quick')}
            params={{ journeyId }}
            to="/j/$journeyId/quick"
          >
            {t('owner.tabs.quick')}
          </Link>
        </li>
        <li>
          <Link
            aria-current={aria('members')}
            className={tab('members')}
            params={{ journeyId }}
            to="/j/$journeyId/members"
          >
            {t('owner.tabs.members')}
          </Link>
        </li>
        <li>
          <Link
            aria-current={aria('trash')}
            className={tab('trash')}
            params={{ journeyId }}
            to="/j/$journeyId/trash"
          >
            {t('owner.tabs.trash')}
          </Link>
        </li>
        <li className="ml-auto">
          {publicPaths === null || publicPaths === undefined ? (
            <span
              aria-disabled="true"
              className={cn(TAB_BASE, 'cursor-not-allowed text-muted/60')}
              data-testid="public-tab-disabled"
              title={publicPaths === null ? t('owner.publicHint') : undefined}
            >
              {t('owner.tabs.public')}
              <span className="sr-only">
                {publicPaths === null ? ` (${t('owner.publicHint')})` : ''}
              </span>
            </span>
          ) : (
            <Link
              className={cn(TAB_BASE, TAB_IDLE)}
              params={{
                journeySlug: publicPaths.journeySlug,
                spaceHandle: publicPaths.spaceHandle,
              }}
              search={{}}
              to="/$spaceHandle/$journeySlug"
            >
              {t('owner.tabs.public')}
              <ExternalLink aria-hidden="true" size={14} />
            </Link>
          )}
        </li>
      </ul>
    </nav>
  )
}
