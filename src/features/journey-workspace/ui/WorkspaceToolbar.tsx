import { Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OrganizeDialog } from '@/features/journey-organize/ui/OrganizeJourneyButton'
import { OverflowMenu } from '@/features/journey-workspace/ui/OverflowMenu'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'

/**
 * Workspace actions: import, quick note and the "..." menu with automatic
 * organizing. A bottom action bar on narrow screens, header actions from `sm`.
 */
export function WorkspaceToolbar({ journeyId }: { journeyId: string }) {
  const { t } = useTranslation()
  const [organizing, setOrganizing] = useState(false)
  const closeOrganize = useCallback(() => {
    setOrganizing(false)
  }, [])
  return (
    <>
      <div
        aria-label={t('workspace.toolbar')}
        className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 pt-3 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] backdrop-blur sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        role="toolbar"
      >
        <Link
          className={cn(
            buttonVariants({ variant: 'primary' }),
            'flex-1 sm:flex-none',
          )}
          params={{ journeyId }}
          to="/j/$journeyId/import"
        >
          {t('workspace.import')}
        </Link>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'flex-1 sm:flex-none',
          )}
          params={{ journeyId }}
          to="/j/$journeyId/quick"
        >
          {t('quickNote.title')}
        </Link>
        <OverflowMenu
          actions={[
            {
              key: 'organize',
              label: t('autoOrganize.button'),
              onSelect: () => {
                setOrganizing(true)
              },
            },
          ]}
          className="border border-border/80 bg-surface"
          description={t('workspace.organizeHint')}
          label={t('workspace.moreActions')}
          name={t('workspace.moreActions')}
        />
      </div>
      {organizing ? (
        <OrganizeDialog journeyId={journeyId} onClose={closeOrganize} />
      ) : null}
    </>
  )
}
