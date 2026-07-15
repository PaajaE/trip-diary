import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getJourneyPublicPaths } from '@/entities/sharing/api/public-sharing.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import {
  buildPublicMomentShare,
  buildPublicTripShare,
} from '@/features/sharing/lib/build-share-messages'
import { ShareActions } from '@/features/sharing/ui/ShareActions'
import { Button } from '@/shared/ui/Button'
import { FullScreenSheet } from '@/shared/ui/FullScreenSheet'

interface ShareMomentPromptProps {
  entrySlug: string
  entryTitle: string
  journeyId: string
  journeyTitle: string
  momentPendingSync?: boolean
  onClose: () => void
  open: boolean
  photosFailed?: boolean
}

export function ShareMomentPrompt({
  entrySlug,
  entryTitle,
  journeyId,
  journeyTitle,
  momentPendingSync = false,
  onClose,
  open,
  photosFailed = false,
}: ShareMomentPromptProps) {
  const { t } = useTranslation()
  const pathsQuery = useQuery({
    enabled: open,
    queryFn: () => getJourneyPublicPaths(journeyId),
    queryKey: journeyQueryKeys.publicPaths(journeyId),
  })

  const paths = pathsQuery.data
  const tripShare =
    paths === null || paths === undefined
      ? null
      : buildPublicTripShare(
          paths,
          t('reader.shareTripMessage', { title: journeyTitle }),
        )
  const momentShare =
    paths === null || paths === undefined
      ? null
      : buildPublicMomentShare(
          paths,
          entrySlug,
          t('reader.shareMomentMessage', { title: entryTitle }),
        )

  return (
    <FullScreenSheet
      closeLabel={t('reader.sharePromptSkip')}
      onClose={onClose}
      open={open}
      title={t('reader.sharePromptTitle')}
    >
      <div className="space-y-6">
        <p className="max-w-2xl leading-7 text-muted">
          {t('reader.sharePromptDescription')}
        </p>
        {photosFailed ? (
          <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-900">
            {t('journey.photosFailedNotice')}
          </p>
        ) : null}
        {pathsQuery.isPending ? (
          <p className="text-sm text-muted">{t('reader.sharePromptLoading')}</p>
        ) : pathsQuery.isError ? (
          <div className="space-y-3">
            <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm text-destructive">
              {t('reader.sharePromptError')}
            </p>
            <Button
              onClick={() => {
                void pathsQuery.refetch()
              }}
              type="button"
              variant="secondary"
            >
              {t('reader.sharePromptRetry')}
            </Button>
          </div>
        ) : tripShare === null ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-5 py-4 text-sm text-muted">
            {t('reader.sharePromptUnavailable')}
          </p>
        ) : (
          <div className="space-y-8">
            {momentShare === null ? null : (
              <section>
                <h3 className="text-lg font-semibold">
                  {t('reader.sharePromptMoment')}
                </h3>
                {momentPendingSync ? (
                  <p className="mt-2 text-sm text-muted">
                    {t('reader.shareMomentPendingSync')}
                  </p>
                ) : null}
                <ShareActions
                  className="mt-4"
                  shareText={momentShare.shareText}
                  shareUrl={momentShare.shareUrl}
                  title={entryTitle}
                />
              </section>
            )}
            <section>
              <h3 className="text-lg font-semibold">
                {t('reader.sharePromptTrip')}
              </h3>
              <ShareActions
                className="mt-4"
                shareText={tripShare.shareText}
                shareUrl={tripShare.shareUrl}
                title={journeyTitle}
              />
            </section>
          </div>
        )}
        <Button className="w-full" onClick={onClose} type="button">
          {t('reader.sharePromptContinue')}
        </Button>
      </div>
    </FullScreenSheet>
  )
}
