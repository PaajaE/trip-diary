import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import {
  changeSpaceMemberRole,
  createSpaceInvite,
  listMySpaces,
  listSpaceMembers,
  removeSpaceMember,
} from '@/entities/space/api/space.repository'
import { spaceQueryKeys } from '@/entities/space/api/space-query-keys'
import { useSession } from '@/features/auth/session'
import type { SpaceRole } from '@/features/spaces'
import { SpaceMembersPage } from '@/pages/spaces/SpaceMembersPage'

export function SpaceMembersRoutePage() {
  const { spaceId } = useParams({ from: '/spaces/$spaceId/members' })
  const { loading, user } = useSession()
  const spacesQuery = useQuery({
    enabled: user !== null,
    queryFn: () => listMySpaces(user?.id ?? ''),
    queryKey: spaceQueryKeys.byUser(user?.id),
  })
  const membersQuery = useQuery({
    enabled: user !== null,
    queryFn: () => listSpaceMembers(spaceId),
    queryKey: spaceQueryKeys.members(spaceId),
  })

  if (loading) return <Message>Načítám členy prostoru…</Message>
  if (user === null) return <Message>Pro správu členů se přihlaste.</Message>
  if (spacesQuery.isPending || membersQuery.isPending) {
    return <Message>Načítám členy prostoru…</Message>
  }
  const space = spacesQuery.data?.find(({ id }) => id === spaceId)
  if (space === undefined || membersQuery.isError) {
    return <Message>Tento prostor není dostupný.</Message>
  }

  const isOwner = space.role === 'owner'
  return (
    <>
      <div className="mx-auto max-w-3xl px-5 pt-8 sm:px-8">
        <Link className="font-semibold text-primary" to="/spaces">
          Zpět na prostory
        </Link>
      </div>
      <SpaceMembersPage
        members={membersQuery.data.map((member) => ({
          avatarUrl: member.avatarUrl,
          canChangeRole: isOwner && member.userId !== user.id,
          canRemove: isOwner && member.userId !== user.id,
          displayName:
            member.displayName ?? member.username ?? 'Člen cestovního deníku',
          id: member.userId,
          isCurrentUser: member.userId === user.id,
          role: member.role,
          username: member.username,
        }))}
        onChangeRole={async (memberId, role: SpaceRole) => {
          await changeSpaceMemberRole(spaceId, memberId, role)
          await membersQuery.refetch()
        }}
        onCopyInviteLink={(link) => navigator.clipboard.writeText(link)}
        onCreateInvite={async (values) => {
          const token = await createSpaceInvite({ ...values, spaceId })
          return `${window.location.origin}${import.meta.env.BASE_URL}invite/${token}`
        }}
        onRemove={async (memberId) => {
          await removeSpaceMember(spaceId, memberId)
          await membersQuery.refetch()
        }}
        spaceName={space.name}
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
