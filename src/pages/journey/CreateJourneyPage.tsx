import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { CreateJourneyForm } from '@/features/journeys/ui/CreateJourneyForm'
import { useActiveSpace } from '@/features/spaces'
import { Card, PageContainer, PageHeader } from '@/shared/ui/PageLayout'

export function CreateJourneyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loading, user } = useSession()
  const spacesQuery = useActiveSpace(user?.id)

  return (
    <PageContainer width="form">
      <PageHeader
        crumbs={[
          <Link
            className="rounded-sm font-medium hover:text-foreground hover:underline"
            key="journeys"
            to="/dashboard"
          >
            {t('owner.myJourneys')}
          </Link>,
          <span key="current">{t('journey.createTitle')}</span>,
        ]}
        description={t('journey.createDescription')}
        title={t('journey.createTitle')}
      />
      {loading ? (
        <p className="text-muted">{t('journey.loading')}</p>
      ) : user === null ? (
        <p className="text-muted">
          {t('journey.signInRequired')}{' '}
          <Link className="font-semibold text-primary" to="/sign-in">
            {t('home.signIn')}
          </Link>
        </p>
      ) : spacesQuery.isPending ? (
        <p className="text-muted">Načítám publikační prostor…</p>
      ) : spacesQuery.activeSpace === null ? (
        <p className="text-destructive">
          Pro publikování potřebujete osobní nebo rodinný prostor.
        </p>
      ) : (
        <Card>
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
        </Card>
      )}
    </PageContainer>
  )
}
