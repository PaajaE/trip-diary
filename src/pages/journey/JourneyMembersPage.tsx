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

interface JourneyMembersPageProps {
  journeyTitle: string
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

export function JourneyMembersPage({
  journeyTitle,
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
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-medium text-accent">{journeyTitle}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {t('journey.members.title')}
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-muted">
          {t('journey.members.description')}
        </p>
      </header>
      <section className="py-8 sm:py-10">
        <h2 className="text-xl font-semibold">
          {t('journey.members.inviteTitle')}
        </h2>
        <div className="mt-5 rounded-md bg-surface p-5 shadow-soft sm:p-6">
          <CreateInviteForm
            onCopyInviteLink={onCopyInviteLink}
            onCreateInvite={onCreateInvite}
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <h2 className="text-xl font-semibold">
          {t('journey.members.pendingInvitesTitle', {
            count: pendingInvites.length,
          })}
        </h2>
        <div className="mt-5">
          <JourneyPendingInvitesList
            invites={pendingInvites}
            onRevoke={onRevokeInvite}
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <h2 className="text-xl font-semibold">
          {t('journey.members.addByUsernameTitle')}
        </h2>
        <div className="mt-5 rounded-md bg-surface p-5 shadow-soft sm:p-6">
          <AddJourneyMemberForm onSubmit={onAddMember} />
        </div>
      </section>
      <section className="pb-10">
        <h2 className="mb-5 text-xl font-semibold">
          {t('journey.members.listTitle', { count: members.length })}
        </h2>
        <JourneyMembersList
          members={members}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
        />
      </section>
    </main>
  )
}
