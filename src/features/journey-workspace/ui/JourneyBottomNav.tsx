import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  CalendarDays,
  ImagePlus,
  Images,
  LayoutList,
  Map as MapIcon,
  Mic,
  PenLine,
  Plus,
  Route,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import type { JourneyTab } from '@/features/journey-workspace/ui/JourneyTabs'
import { WorkspaceDialog } from '@/features/journey-workspace/ui/WorkspaceDialog'
import { cn } from '@/shared/lib/cn'
import { haptic } from '@/shared/lib/haptics'

const ITEM =
  'flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[0.6875rem] font-semibold transition-colors'
const ITEM_ACTIVE = 'text-primary'
const ITEM_IDLE = 'text-muted hover:text-foreground'

/**
 * Bottom tab bar of the owner journey pages on narrow screens (hidden from
 * `sm`, where `JourneyTabs` carries the navigation): Journey, Sorting, a round
 * "+" that opens the add sheet, Map and Read (the public page, disabled while
 * the journey is not public). `BOTTOM_NAV_SPACER` keeps content above it.
 */
export function JourneyBottomNav({
  batchCount = 0,
  current,
  journeyId,
  publicPaths,
}: {
  batchCount?: number
  current: JourneyTab
  journeyId: string
  publicPaths: PublicJourneyPaths | null | undefined
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const active = (key: JourneyTab) => (current === key ? 'page' : undefined)
  const cls = (key: JourneyTab) =>
    cn(ITEM, current === key ? ITEM_ACTIVE : ITEM_IDLE)

  return (
    <>
      <nav
        aria-label={t('owner.bottomNav.label')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur sm:hidden"
        data-testid="journey-bottom-nav"
      >
        <ul className="flex items-center px-2">
          <li className="flex flex-1">
            <Link
              aria-current={active('workspace')}
              className={cls('workspace')}
              params={{ journeyId }}
              search={{}}
              to="/j/$journeyId/workspace"
            >
              <Route aria-hidden="true" size={22} />
              {t('owner.bottomNav.workspace')}
            </Link>
          </li>
          <li className="flex flex-1">
            <Link
              aria-current={active('batch')}
              className={cn(cls('batch'), 'relative')}
              params={{ journeyId }}
              to="/j/$journeyId/batch"
            >
              <LayoutList aria-hidden="true" size={22} />
              {t('owner.bottomNav.batch')}
              {batchCount > 0 ? (
                <>
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 left-1/2 ml-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] leading-4 font-semibold text-white"
                    data-testid="bottom-nav-badge"
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
          <li className="flex flex-1 justify-center">
            <button
              aria-haspopup="dialog"
              aria-label={t('owner.bottomNav.add')}
              className="-mt-5 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft hover:bg-primary/90"
              type="button"
              onClick={() => {
                setAdding(true)
              }}
            >
              <Plus aria-hidden="true" size={28} />
            </button>
          </li>
          <li className="flex flex-1">
            <Link
              className={cn(ITEM, ITEM_IDLE)}
              params={{ journeyId }}
              search={{ map: 'full' }}
              to="/j/$journeyId/workspace"
            >
              <MapIcon aria-hidden="true" size={22} />
              {t('owner.bottomNav.map')}
            </Link>
          </li>
          <li className="flex flex-1">
            {publicPaths === null || publicPaths === undefined ? (
              <span
                aria-disabled="true"
                className={cn(ITEM, 'cursor-not-allowed text-muted/50')}
                data-testid="bottom-nav-read-disabled"
                title={publicPaths === null ? t('owner.publicHint') : undefined}
              >
                <BookOpen aria-hidden="true" size={22} />
                {t('owner.bottomNav.read')}
                <span className="sr-only">
                  {publicPaths === null ? ` (${t('owner.publicHint')})` : ''}
                </span>
              </span>
            ) : (
              <Link
                className={cn(ITEM, ITEM_IDLE)}
                params={{
                  journeySlug: publicPaths.journeySlug,
                  spaceHandle: publicPaths.spaceHandle,
                }}
                search={{}}
                to="/$spaceHandle/$journeySlug"
              >
                <BookOpen aria-hidden="true" size={22} />
                {t('owner.bottomNav.read')}
              </Link>
            )}
          </li>
        </ul>
      </nav>
      {adding ? (
        <AddSheet
          journeyId={journeyId}
          onClose={() => {
            setAdding(false)
          }}
        />
      ) : null}
    </>
  )
}

/** Bottom padding that keeps page content clear of the fixed bar (below `sm`). */
export function BottomNavSpacer(): ReactNode {
  return (
    <div
      aria-hidden="true"
      className="h-[calc(4.5rem+env(safe-area-inset-bottom))] sm:hidden"
      data-testid="bottom-nav-spacer"
    />
  )
}

function AddSheet({
  journeyId,
  onClose,
}: {
  journeyId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const tile =
    'flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-2 py-3 text-center text-sm font-semibold hover:bg-white active:bg-white'
  const row =
    'flex min-h-14 items-center gap-3 rounded-xl px-3 text-left hover:bg-surface active:bg-surface'
  const choose = () => {
    haptic('light')
    onClose()
  }
  return (
    <WorkspaceDialog title={t('owner.addSheet.title')} onClose={onClose}>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Link
          className={tile}
          data-testid="add-note"
          params={{ journeyId }}
          to="/j/$journeyId/quick"
          onClick={choose}
        >
          <PenLine aria-hidden="true" size={26} />
          {t('owner.addSheet.note')}
        </Link>
        <Link
          className={tile}
          data-testid="add-photos"
          params={{ journeyId }}
          to="/j/$journeyId/import"
          onClick={choose}
        >
          <Images aria-hidden="true" size={26} />
          {t('owner.addSheet.photos')}
        </Link>
        <Link
          className={tile}
          data-testid="add-voice"
          params={{ journeyId }}
          search={{ voice: true }}
          to="/j/$journeyId/quick"
          onClick={choose}
        >
          <Mic aria-hidden="true" size={26} />
          {t('owner.addSheet.voice')}
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-border">
        <li>
          <Link
            className={row}
            params={{ journeyId }}
            to="/j/$journeyId/import"
            onClick={choose}
          >
            <ImagePlus aria-hidden="true" className="shrink-0" size={22} />
            <span>
              <span className="block text-base font-semibold">
                {t('owner.addSheet.fromLibrary')}
              </span>
              <span className="block text-sm text-muted">
                {t('owner.addSheet.fromLibraryHint')}
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link
            className={row}
            params={{ journeyId }}
            to="/j/$journeyId/quick"
            onClick={choose}
          >
            <CalendarDays aria-hidden="true" className="shrink-0" size={22} />
            <span>
              <span className="block text-base font-semibold">
                {t('owner.addSheet.todayNote')}
              </span>
              <span className="block text-sm text-muted">
                {t('owner.addSheet.todayNoteHint')}
              </span>
            </span>
          </Link>
        </li>
      </ul>
      <button
        className="mt-3 min-h-11 w-full rounded-xl border border-border px-4 font-semibold"
        type="button"
        onClick={onClose}
      >
        {t('owner.addSheet.close')}
      </button>
    </WorkspaceDialog>
  )
}
