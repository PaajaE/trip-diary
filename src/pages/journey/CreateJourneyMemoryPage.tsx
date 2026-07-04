import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { listJourneyChecklistItems } from '@/entities/checklist/api/checklist-mutation.repository'
import { getJourneyFromCache } from '@/entities/journey/api/journey.repository'
import { useJourneyQuery } from '@/entities/journey/api/use-journey-query'
import { useSession } from '@/features/auth/session'
import { CreateJourneyMemoryForm } from '@/features/journeys/ui/CreateJourneyMemoryForm'

interface CreateJourneyMemoryPageProps {
  focus?: 'note'
  journeyId: string
  natureGoalId?: string
}

export function CreateJourneyMemoryPage({
  focus,
  journeyId,
  natureGoalId,
}: CreateJourneyMemoryPageProps) {
  const noteFieldRef = useRef<HTMLTextAreaElement | null>(null)
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { loading, user } = useSession()
  const journeyQuery = useJourneyQuery(journeyId)
  const checklistQuery = useQuery({
    enabled: natureGoalId !== undefined,
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: ['journey-checklist', journeyId],
  })
  const natureGoal = useMemo(() => {
    if (natureGoalId === undefined) {
      return null
    }

    const items = Array.isArray(checklistQuery.data) ? checklistQuery.data : []
    return items.find((item) => item.id === natureGoalId) ?? null
  }, [checklistQuery.data, natureGoalId])

  useEffect(() => {
    if (focus !== 'note') {
      return
    }
    noteFieldRef.current?.focus()
    noteFieldRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [focus])

  async function navigateToSavedMoment(
    entryId: string,
    options?: {
      naturePrompt?: boolean
      photosFailed?: boolean
    },
  ) {
    const refreshed = await getJourneyFromCache(journeyId)
    if (refreshed !== null) {
      queryClient.setQueryData(['journeys', journeyId, 'local'], refreshed)
      queryClient.setQueryData(['journeys', journeyId], refreshed)
    }
    await queryClient.invalidateQueries({ queryKey: ['journeys', journeyId] })
    await queryClient.invalidateQueries({ queryKey: ['journey-gallery'] })
    await queryClient.invalidateQueries({
      queryKey: ['journey-photo-locations', journeyId],
    })
    await queryClient.invalidateQueries({
      queryKey: ['journey-checklist', journeyId],
    })
    await queryClient.invalidateQueries({
      queryKey: ['journey-observations', journeyId],
    })
    await navigate({
      params: { journeyId },
      search: {
        highlight: entryId,
        ...(options?.naturePrompt === true ? { naturePrompt: entryId } : {}),
        ...(natureGoalId !== undefined ? { natureGoalId } : {}),
        ...(options?.photosFailed === true ? { notice: 'photos_failed' } : {}),
      },
      to: '/j/$journeyId',
    })
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
        {natureGoal !== null ? (
          <p className="mt-3 text-sm font-medium text-primary">
            {t('journey.memoryNatureGoalHint', { title: natureGoal.title })}
          </p>
        ) : null}
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
          noteFieldRef={noteFieldRef}
          {...(natureGoal !== null ? { natureGoal } : {})}
          onCreated={(meta) => {
            void navigateToSavedMoment(meta.entryId, {
              naturePrompt: meta.photoIds.length > 0,
              ...(meta.photosFailed === true ? { photosFailed: true } : {}),
            })
          }}
          spaceId={journeyQuery.data.spaceId}
        />
      )}
    </main>
  )
}
