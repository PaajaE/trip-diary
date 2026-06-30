import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { JourneyOrganizePanel } from '@/features/journeys/ui/JourneyOrganizePanel'
import {
  buildPublicJourneyPath,
  type PublicJourneyPaths,
} from '@/features/sharing/lib/public-paths'
import { FullScreenSheet } from '@/shared/ui/FullScreenSheet'

interface JourneyManageSheetProps {
  canManageJourney: boolean
  canManageMembers?: boolean
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  onClose: () => void
  onDeleted: () => void
  open: boolean
  publicPaths?: PublicJourneyPaths
}

export function JourneyManageSheet({
  canManageJourney,
  canManageMembers = false,
  creatorId,
  journey,
  onChanged,
  onClose,
  onDeleted,
  open,
  publicPaths,
}: JourneyManageSheetProps) {
  const { t } = useTranslation()
  const showQuickLinks = canManageMembers || publicPaths !== undefined

  return (
    <FullScreenSheet
      closeLabel={t('journey.manageClose')}
      onClose={onClose}
      open={open}
      title={t('journey.manageTrip')}
    >
      {showQuickLinks ? (
        <div className="mb-5 flex flex-col gap-2 border-b border-border pb-5">
          {canManageMembers ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md px-1 text-sm font-semibold text-primary hover:underline"
              onClick={onClose}
              params={{ journeyId: journey.id }}
              to="/j/$journeyId/members"
            >
              {t('journey.manageMembers')}
            </Link>
          ) : null}
          {publicPaths !== undefined ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md px-1 text-sm font-semibold text-primary hover:underline"
              onClick={onClose}
              to={buildPublicJourneyPath(publicPaths)}
            >
              {t('reader.viewPublicTrip')}
            </Link>
          ) : null}
        </div>
      ) : null}
      <JourneyOrganizePanel
        canManageJourney={canManageJourney}
        creatorId={creatorId}
        embedded
        journey={journey}
        onChanged={onChanged}
        onDeleted={onDeleted}
      />
    </FullScreenSheet>
  )
}
