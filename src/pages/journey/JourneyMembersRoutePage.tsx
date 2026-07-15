import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  addJourneyMemberByUsername,
  changeJourneyMemberRole,
  createJourneyInvite,
  isJourneyOwner,
  listJourneyMembers,
  listJourneyPendingInvites,
  removeJourneyMember,
  revokeJourneyInvite,
} from '@/entities/journey/api/journey-member.repository'
import { useJourneyQuery } from '@/entities/journey/api/use-journey-query'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { useSession } from '@/features/auth/session'
import { JourneyMembersPage } from '@/pages/journey/JourneyMembersPage'

export function JourneyMembersRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/members' })
  const { loading, user } = useSession()
  const journeyQuery = useJourneyQuery(journeyId)
  const ownerQuery = useQuery({
    enabled: user !== null,
    queryFn: () => isJourneyOwner(journeyId),
    queryKey: journeyQueryKeys.owner(journeyId),
  })
  const membersQuery = useQuery({
    enabled: user !== null,
    queryFn: () => listJourneyMembers(journeyId),
    queryKey: journeyQueryKeys.members(journeyId),
  })
  const pendingInvitesQuery = useQuery({
    enabled: user !== null && ownerQuery.data === true,
    queryFn: () => listJourneyPendingInvites(journeyId),
    queryKey: journeyQueryKeys.pendingInvites(journeyId),
  })

  if (loading || journeyQuery.isPending || ownerQuery.isPending) {
    return <Message>{t('journey.loading')}</Message>
  }
  if (user === null) {
    return <Message>{t('journey.signInRequired')}</Message>
  }
  if (journeyQuery.data == null || journeyQuery.isError) {
    return <Message>{t('journey.notFound')}</Message>
  }
  if (ownerQuery.data !== true) {
    return <Message>{t('journey.members.ownerRequired')}</Message>
  }
  if (membersQuery.isPending || pendingInvitesQuery.isPending) {
    return <Message>{t('journey.members.loading')}</Message>
  }
  if (membersQuery.isError || pendingInvitesQuery.isError) {
    return <Message>{t('journey.members.error')}</Message>
  }

  const members = membersQuery.data
  const pendingInvites = pendingInvitesQuery.data
  return (
    <>
      <div className="mx-auto max-w-3xl px-5 pt-8 sm:px-8">
        <Link
          className="font-semibold text-primary"
          params={{ journeyId }}
          search={{}}
          to="/j/$journeyId"
        >
          {t('journey.members.back')}
        </Link>
      </div>
      <JourneyMembersPage
        journeyTitle={journeyQuery.data.title}
        members={members.map((member) => ({
          avatarUrl: member.avatarUrl,
          canChangeRole: member.userId !== user.id,
          canRemove: member.userId !== user.id && member.role !== 'owner',
          displayName:
            member.displayName ??
            member.username ??
            t('journey.members.anonymous'),
          id: member.userId,
          isCurrentUser: member.userId === user.id,
          role: member.role,
          username: member.username,
        }))}
        pendingInvites={pendingInvites}
        onAddMember={async (values) => {
          await addJourneyMemberByUsername({
            journeyId,
            role: values.role,
            username: values.username,
          })
          await membersQuery.refetch()
        }}
        onCopyInviteLink={(link) => navigator.clipboard.writeText(link)}
        onCreateInvite={async (values) => {
          const token = await createJourneyInvite({
            email: values.email,
            journeyId,
            role: values.role,
          })
          await pendingInvitesQuery.refetch()
          return `${window.location.origin}${import.meta.env.BASE_URL}journey-invite/${token}`
        }}
        onChangeRole={async (memberId, role) => {
          await changeJourneyMemberRole(journeyId, memberId, role)
          await membersQuery.refetch()
        }}
        onRemove={async (memberId) => {
          await removeJourneyMember(journeyId, memberId)
          await membersQuery.refetch()
        }}
        onRevokeInvite={async (inviteId) => {
          await revokeJourneyInvite(inviteId)
          await pendingInvitesQuery.refetch()
        }}
      />
    </>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-muted sm:px-8">
      {children}
    </main>
  )
}
