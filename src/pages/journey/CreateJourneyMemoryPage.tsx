import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { getJourney } from '@/entities/journey/api/journey.repository'
import { useSession } from '@/features/auth/session'
import { CreateJourneyMemoryForm } from '@/features/journeys/ui/CreateJourneyMemoryForm'

interface CreateJourneyMemoryPageProps {
  journeyId: string
}

export function CreateJourneyMemoryPage({
  journeyId,
}: CreateJourneyMemoryPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { loading, user } = useSession()
  const journeyQuery = useQuery({
    queryFn: () => getJourney(journeyId),
    queryKey: ['journeys', journeyId, 'capture'],
  })

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

      {loading ? (
        <p className="mt-8 text-muted">{t('journey.loading')}</p>
      ) : user === null ? (
        <p className="mt-8 text-muted">
          {t('journey.signInRequired')}{' '}
          <Link className="font-semibold text-primary" to="/sign-in">
            {t('home.signIn')}
          </Link>
        </p>
      ) : journeyQuery.isPending ? (
        <p className="mt-8 text-muted">{t('journey.loading')}</p>
      ) : journeyQuery.isError || journeyQuery.data === null ? (
        <p className="mt-8 text-destructive">{t('journey.error')}</p>
      ) : (
        <CreateJourneyMemoryForm
          creatorId={user.id}
          journey={journeyQuery.data}
          onCreated={() => {
            void queryClient.invalidateQueries({
              queryKey: ['journeys', journeyId],
            })
            void queryClient.invalidateQueries({
              queryKey: ['journey-gallery'],
            })
            void navigate({ params: { journeyId }, to: '/j/$journeyId' })
          }}
          spaceId={journeyQuery.data.spaceId}
        />
      )}
    </main>
  )
}
