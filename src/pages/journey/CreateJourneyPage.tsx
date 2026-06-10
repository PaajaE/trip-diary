import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { CreateJourneyForm } from '@/features/journeys/ui/CreateJourneyForm'

export function CreateJourneyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loading, user } = useSession()

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
      ) : (
        <CreateJourneyForm
          creatorId={user.id}
          onCreated={(journeyId) =>
            void navigate({ params: { journeyId }, to: '/j/$journeyId' })
          }
        />
      )}
    </main>
  )
}
