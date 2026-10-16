import { ShieldCheck, UserMinus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  journeyMemberRoleLabels,
  type JourneyMemberRole,
} from '@/entities/journey/model/journey-member'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'

export interface JourneyMemberViewModel {
  avatarUrl?: string | null
  canChangeRole: boolean
  canRemove: boolean
  displayName: string
  id: string
  isCurrentUser?: boolean
  role: JourneyMemberRole
  username?: string | null
}

interface JourneyMembersListProps {
  members: JourneyMemberViewModel[]
  onChangeRole: (
    memberId: string,
    role: JourneyMemberRole,
  ) => Promise<void> | void
  onRemove: (memberId: string) => Promise<void> | void
}

export function JourneyMembersList({
  members,
  onChangeRole,
  onRemove,
}: JourneyMembersListProps) {
  const { t } = useTranslation()

  if (members.length === 0) {
    return (
      <EmptyState
        description={t('journey.members.empty')}
        icon={Users}
        title={t('journey.members.title')}
      />
    )
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border/70 bg-surface shadow-soft">
      {members.map((member) => (
        <li
          className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5"
          key={member.id}
        >
          <Avatar label={member.displayName} src={member.avatarUrl} />
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate text-sm font-semibold">
              {member.displayName}
              {member.isCurrentUser ? (
                <span className="ml-2 font-normal text-muted">
                  ({t('journey.members.you')})
                </span>
              ) : null}
            </p>
            {member.username ? (
              <p className="truncate text-xs text-muted">@{member.username}</p>
            ) : null}
          </div>
          {member.canChangeRole ? (
            <select
              aria-label={t('journey.members.roleFor', {
                name: member.displayName,
              })}
              className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm"
              onChange={(event) => {
                void onChangeRole(
                  member.id,
                  event.target.value as JourneyMemberRole,
                )
              }}
              value={member.role}
            >
              <option value="owner">{journeyMemberRoleLabels.owner}</option>
              <option value="editor">{journeyMemberRoleLabels.editor}</option>
              <option value="member">{journeyMemberRoleLabels.member}</option>
            </select>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {member.role === 'owner' ? (
                <ShieldCheck aria-hidden="true" size={14} />
              ) : null}
              {journeyMemberRoleLabels[member.role]}
            </span>
          )}
          {member.canRemove ? (
            <Button
              aria-label={t('journey.members.removeFor', {
                name: member.displayName,
              })}
              onClick={() => {
                void onRemove(member.id)
              }}
              variant="destructive"
            >
              <UserMinus aria-hidden="true" size={17} />
              <span className="hidden sm:inline">
                {t('journey.members.remove')}
              </span>
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
