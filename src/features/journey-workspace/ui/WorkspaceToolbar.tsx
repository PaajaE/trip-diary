import { Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OrganizeDialog } from '@/features/journey-organize/ui/OrganizeJourneyButton'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'

/**
 * Workspace header actions: import, quick note and a secondary button that
 * opens the automatic organizing dialog. On narrow screens import and quick
 * note live in the bottom navigation ("+"), so only organizing remains here.
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
        className="flex items-center gap-2"
        role="toolbar"
      >
        <Link
          className={cn(
            buttonVariants({ variant: 'primary' }),
            'hidden sm:inline-flex',
          )}
          params={{ journeyId }}
          to="/j/$journeyId/import"
        >
          {t('workspace.import')}
        </Link>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'hidden sm:inline-flex',
          )}
          params={{ journeyId }}
          to="/j/$journeyId/quick"
        >
          {t('quickNote.title')}
        </Link>
        <button
          className={buttonVariants({ variant: 'secondary' })}
          title={t('workspace.organizeHint')}
          type="button"
          onClick={() => {
            setOrganizing(true)
          }}
        >
          {t('autoOrganize.button')}
        </button>
      </div>
      {organizing ? (
        <OrganizeDialog journeyId={journeyId} onClose={closeOrganize} />
      ) : null}
    </>
  )
}
