import { useTranslation } from 'react-i18next'
import { AddJourneyMemberForm } from '@/features/journeys/ui/AddJourneyMemberForm'
import {
  JourneyMembersList,
  type JourneyMemberViewModel,
} from '@/features/journeys/ui/JourneyMembersList'
import { CreateInviteForm } from '@/features/spaces/ui/CreateInviteForm'
import { JourneyPendingInvitesList } from '@/features/journeys/ui/JourneyPendingInvitesList'
import type { CreateInviteValues } from '@/features/spaces/model/spaces'
import type {
  JourneyMemberRole,
  JourneyPendingInvite,
} from '@/entities/journey/model/journey-member'
import { Card, SectionHeading } from '@/shared/ui/PageLayout'

interface JourneyMembersPageProps {
  members: JourneyMemberViewModel[]
  pendingInvites: JourneyPendingInvite[]
  onAddMember: (values: {
    role: Exclude<JourneyMemberRole, 'owner'>
    username: string
  }) => Promise<void>
  onChangeRole: (
    memberId: string,
    role: JourneyMemberRole,
  ) => Promise<void> | void
  onCopyInviteLink: (link: string) => Promise<void> | void
  onCreateInvite: (values: CreateInviteValues) => Promise<string>
  onRemove: (memberId: string) => Promise<void> | void
  onRevokeInvite: (inviteId: string) => Promise<void> | void
}

/** Content of the members tab; the frame (title, tabs) comes from the route. */
export function JourneyMembersPage({
  members,
  pendingInvites,
  onAddMember,
  onChangeRole,
  onCopyInviteLink,
  onCreateInvite,
  onRemove,
  onRevokeInvite,
}: JourneyMembersPageProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading>
          {t('journey.members.listTitle', { count: members.length })}
        </SectionHeading>
        <JourneyMembersList
          members={members}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
        />
      </section>
      <section>
        <SectionHeading>{t('journey.members.inviteTitle')}</SectionHeading>
        <Card>
          <CreateInviteForm
            onCopyInviteLink={onCopyInviteLink}
            onCreateInvite={onCreateInvite}
          />
        </Card>
      </section>
      <section>
        <SectionHeading>
          {t('journey.members.pendingInvitesTitle', {
            count: pendingInvites.length,
          })}
        </SectionHeading>
        <JourneyPendingInvitesList
          invites={pendingInvites}
          onRevoke={onRevokeInvite}
        />
      </section>
      <section>
        <SectionHeading>
          {t('journey.members.addByUsernameTitle')}
        </SectionHeading>
        <Card>
          <AddJourneyMemberForm onSubmit={onAddMember} />
        </Card>
      </section>
    </div>
  )
}
