import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useJourneyQuery } from '@/entities/journey/api/use-journey-query'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { getJourneyPublicPaths } from '@/entities/sharing/api/public-sharing.repository'
import {
  JourneyTabs,
  type JourneyTab,
} from '@/features/journey-workspace/ui/JourneyTabs'
import { PageContainer, PageHeader } from '@/shared/ui/PageLayout'

const CRUMB_LINK =
  'rounded-sm font-medium hover:text-foreground hover:underline'

/**
 * Common frame of the owner pages of one journey: breadcrumb, page title,
 * sub-navigation (workspace / import / quick note / members / public page).
 * With `title` omitted the page title is the journey title.
 */
export function JourneyOwnerFrame({
  actions,
  children,
  current,
  description,
  descriptionClassName,
  journeyId,
  title,
  width = 'narrow',
}: {
  actions?: ReactNode
  children: ReactNode
  current: JourneyTab
  description?: ReactNode
  descriptionClassName?: string
  journeyId: string
  title?: string
  width?: 'form' | 'narrow' | 'wide'
}) {
  const { t } = useTranslation()
  const journeyQuery = useJourneyQuery(journeyId)
  const publicPathsQuery = useQuery({
    queryFn: () => getJourneyPublicPaths(journeyId),
    queryKey: journeyQueryKeys.publicPaths(journeyId),
  })
  const journeyTitle = journeyQuery.data?.title ?? ''
  const myJourneys = (
    <Link className={CRUMB_LINK} to="/dashboard">
      {t('owner.myJourneys')}
    </Link>
  )
  const crumbs =
    title === undefined
      ? [myJourneys, <span key="current">{journeyTitle}</span>]
      : [
          myJourneys,
          <Link
            className={`${CRUMB_LINK} truncate`}
            key="journey"
            params={{ journeyId }}
            to="/j/$journeyId/workspace"
          >
            {journeyTitle}
          </Link>,
          <span key="current">{title}</span>,
        ]

  return (
    <PageContainer width={width}>
      <PageHeader
        crumbs={journeyTitle === '' ? [myJourneys] : crumbs}
        title={title ?? (journeyTitle || t('workspace.title'))}
        {...(actions === undefined ? {} : { actions })}
        {...(description === undefined ? {} : { description })}
        {...(descriptionClassName === undefined
          ? {}
          : { descriptionClassName })}
      />
      <JourneyTabs
        current={current}
        journeyId={journeyId}
        publicPaths={
          publicPathsQuery.isPending
            ? undefined
            : (publicPathsQuery.data ?? null)
        }
      />
      {children}
    </PageContainer>
  )
}
