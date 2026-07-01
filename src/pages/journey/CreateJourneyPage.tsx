import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { CreateJourneyForm } from '@/features/journeys/ui/CreateJourneyForm'
import { useActiveSpace } from '@/features/spaces'

export function CreateJourneyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loading, user } = useSession()
  const spacesQuery = useActiveSpace(user?.id)

  return (
    <main className="mx-auto min-h-svh w-full max-w-2xl px-5 py-8 sm:py-16">
      <h1 className="mt-16 text-4xl font-semibold tracking-[-0.04em]">
        {t('journey.createTitle')}
      </h1>
      {loading ? (
        <p className="mt-8 text-muted">{t('journey.loading')}</p>
      ) : user === null ? (
        <p className="mt-8 text-muted">
          {t('journey.signInRequired')}{' '}
          <Link className="font-semibold text-primary" to="/sign-in">
            {t('home.signIn')}
          </Link>
        </p>
      ) : spacesQuery.isPending ? (
        <p className="mt-8 text-muted">Načítám publikační prostor…</p>
      ) : spacesQuery.activeSpace === null ? (
        <p className="mt-8 text-destructive">
          Pro publikování potřebujete osobní nebo rodinný prostor.
        </p>
      ) : (
        <CreateJourneyForm
          creatorId={user.id}
          onCreated={(journeyId, meta) =>
            void navigate({
              params: { journeyId },
              search:
                meta?.templateFailed === true
                  ? { notice: 'template_failed' }
                  : {},
              to: '/j/$journeyId',
            })
          }
          spaceId={spacesQuery.activeSpace.id}
        />
      )}
    </main>
  )
}
