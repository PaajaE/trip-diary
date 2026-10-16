import type { ReactNode } from 'react'
import {
  CreateInviteForm,
  MembersList,
  type CreateInviteValues,
  type SpaceMemberViewModel,
  type SpaceRole,
} from '@/features/spaces'
import {
  Card,
  PageContainer,
  PageHeader,
  SectionHeading,
} from '@/shared/ui/PageLayout'

interface SpaceMembersPageProps {
  crumbs?: ReactNode[]
  members: SpaceMemberViewModel[]
  onChangeRole: (memberId: string, role: SpaceRole) => Promise<void> | void
  onCopyInviteLink: (link: string) => Promise<void> | void
  onCreateInvite: (values: CreateInviteValues) => Promise<string>
  onRemove: (memberId: string) => Promise<void> | void
  spaceName: string
}

export function SpaceMembersPage({
  crumbs,
  members,
  onChangeRole,
  onCopyInviteLink,
  onCreateInvite,
  onRemove,
  spaceName,
}: SpaceMembersPageProps) {
  return (
    <PageContainer>
      <PageHeader
        {...(crumbs === undefined ? {} : { crumbs })}
        description={`${spaceName}: pozvěte blízké a nastavte, kdo může společný deník spravovat.`}
        title="Členové prostoru"
      />
      <div className="space-y-10">
        <section>
          <SectionHeading>Členové ({members.length})</SectionHeading>
          <MembersList
            members={members}
            onChangeRole={onChangeRole}
            onRemove={onRemove}
          />
        </section>
        <section>
          <SectionHeading>Pozvat člena</SectionHeading>
          <Card>
            <CreateInviteForm
              onCopyInviteLink={onCopyInviteLink}
              onCreateInvite={onCreateInvite}
            />
          </Card>
        </section>
      </div>
    </PageContainer>
  )
}
