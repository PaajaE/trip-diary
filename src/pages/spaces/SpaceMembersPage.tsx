import {
  CreateInviteForm,
  MembersList,
  type CreateInviteValues,
  type SpaceMemberViewModel,
  type SpaceRole,
} from '@/features/spaces'

interface SpaceMembersPageProps {
  members: SpaceMemberViewModel[]
  onChangeRole: (memberId: string, role: SpaceRole) => Promise<void> | void
  onCopyInviteLink: (link: string) => Promise<void> | void
  onCreateInvite: (values: CreateInviteValues) => Promise<string>
  onRemove: (memberId: string) => Promise<void> | void
  spaceName: string
}

export function SpaceMembersPage({
  members,
  onChangeRole,
  onCopyInviteLink,
  onCreateInvite,
  onRemove,
  spaceName,
}: SpaceMembersPageProps) {
  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-medium text-accent">{spaceName}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Členové prostoru
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-muted">
          Pozvěte blízké a nastavte, kdo může společný deník spravovat.
        </p>
      </header>
      <section className="py-8 sm:py-10">
        <h2 className="text-xl font-semibold">Pozvat člena</h2>
        <div className="mt-5 rounded-md bg-surface p-5 shadow-soft sm:p-6">
          <CreateInviteForm
            onCopyInviteLink={onCopyInviteLink}
            onCreateInvite={onCreateInvite}
          />
        </div>
      </section>
      <section className="pb-10">
        <h2 className="mb-5 text-xl font-semibold">
          Členové ({members.length})
        </h2>
        <MembersList
          members={members}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
        />
      </section>
    </main>
  )
}
