import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useJourneyQuery } from '@/entities/journey/api/use-journey-query'
import { useSession } from '@/features/auth/session'
import { CreateJourneyMemoryForm } from '@/features/journeys/ui/CreateJourneyMemoryForm'
import { NatureMatchBanner } from '@/features/nature/ui/NatureMatchBanner'
import { ShareMomentPrompt } from '@/features/sharing/ui/ShareMomentPrompt'

interface CreateJourneyMemoryPageProps {
  journeyId: string
  natureGoalId?: string
}

export function CreateJourneyMemoryPage({
  journeyId,
  natureGoalId,
}: CreateJourneyMemoryPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { loading, user } = useSession()
  const journeyQuery = useJourneyQuery(journeyId)
  const [sharePrompt, setSharePrompt] = useState<{
    entrySlug: string
    entryTitle: string
    photosFailed?: boolean
  } | null>(null)
  const [spottingMeta, setSpottingMeta] = useState<{
    entryId: string
    entrySlug: string
    entryTitle: string
    photoId: string | null
    photosFailed?: boolean
  } | null>(null)

  function continueToJourney(photosFailed?: boolean) {
    void queryClient.invalidateQueries({ queryKey: ['journeys', journeyId] })
    void queryClient.invalidateQueries({ queryKey: ['journey-gallery'] })
    void queryClient.invalidateQueries({
      queryKey: ['journey-photo-locations', journeyId],
    })
    void queryClient.invalidateQueries({
      queryKey: ['journey-checklist', journeyId],
    })
    void queryClient.invalidateQueries({
      queryKey: ['journey-observations', journeyId],
    })
    void navigate({
      params: { journeyId },
      search: photosFailed === true ? { notice: 'photos_failed' } : {},
      to: '/j/$journeyId',
    })
  }

  function openSharePrompt(meta: {
    entrySlug: string
    entryTitle: string
    photosFailed?: boolean
  }) {
    setSharePrompt(meta)
  }

  return (
    <main className="mx-auto min-h-svh w-full max-w-2xl px-5 py-8 sm:py-16">
      <div className="mt-16">
        <p className="text-sm font-medium text-accent">
          {t('journey.memoryEyebrow')}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          {t('journey.memoryTitle')}
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-muted">
          {journeyQuery.data?.title == null
            ? t('journey.memoryDescription')
            : t('journey.memoryDescriptionWithTrip', {
                title: journeyQuery.data.title,
              })}
        </p>
      </div>

      {loading && user === null ? (
        <p className="mt-8 text-muted">{t('journey.loading')}</p>
      ) : user === null ? (
        <p className="mt-8 text-muted">
          {t('journey.signInRequired')}{' '}
          <Link className="font-semibold text-primary" to="/sign-in">
            {t('home.signIn')}
          </Link>
        </p>
      ) : journeyQuery.isLoading ? (
        <p className="mt-8 text-muted">{t('journey.loading')}</p>
      ) : journeyQuery.isError || journeyQuery.data == null ? (
        <p className="mt-8 text-destructive">{t('journey.error')}</p>
      ) : (
        <CreateJourneyMemoryForm
          creatorId={user.id}
          journey={journeyQuery.data}
          onCreated={(meta) => {
            const nextMeta = {
              entryId: meta.entryId,
              entrySlug: meta.entrySlug,
              entryTitle: meta.entryTitle,
              photoId: meta.photoIds[0] ?? null,
              ...(meta.photosFailed === true ? { photosFailed: true } : {}),
            }
            if (meta.photoIds.length > 0) {
              setSpottingMeta(nextMeta)
              return
            }
            openSharePrompt({
              entrySlug: meta.entrySlug,
              entryTitle: meta.entryTitle,
              ...(meta.photosFailed === true ? { photosFailed: true } : {}),
            })
          }}
          spaceId={journeyQuery.data.spaceId}
        />
      )}

      {spottingMeta !== null && user !== null ? (
        <NatureMatchBanner
          className="mt-8"
          creatorId={user.id}
          entryId={spottingMeta.entryId}
          entryTitle={spottingMeta.entryTitle}
          journeyId={journeyId}
          {...(natureGoalId !== undefined ? { natureGoalId } : {})}
          onDismiss={() => {
            const photosFailed = spottingMeta.photosFailed
            setSpottingMeta(null)
            openSharePrompt({
              entrySlug: spottingMeta.entrySlug,
              entryTitle: spottingMeta.entryTitle,
              ...(photosFailed === true ? { photosFailed: true } : {}),
            })
          }}
          onSpotted={() => {
            const photosFailed = spottingMeta.photosFailed
            setSpottingMeta(null)
            openSharePrompt({
              entrySlug: spottingMeta.entrySlug,
              entryTitle: spottingMeta.entryTitle,
              ...(photosFailed === true ? { photosFailed: true } : {}),
            })
          }}
          photoId={spottingMeta.photoId}
        />
      ) : null}

      {journeyQuery.data === null || journeyQuery.data === undefined ? null : (
        <ShareMomentPrompt
          entrySlug={sharePrompt?.entrySlug ?? ''}
          entryTitle={sharePrompt?.entryTitle ?? ''}
          journeyId={journeyId}
          journeyTitle={journeyQuery.data.title}
          momentPendingSync
          onClose={() => {
            const photosFailed = sharePrompt?.photosFailed
            setSharePrompt(null)
            continueToJourney(photosFailed)
          }}
          open={sharePrompt !== null}
          {...(sharePrompt?.photosFailed === true
            ? { photosFailed: true }
            : {})}
        />
      )}
    </main>
  )
}
