import { MoreVertical, ShieldCheck, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  journeyMemberRoleLabels,
  type JourneyMemberRole,
} from '@/entities/journey/model/journey-member'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'

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
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null)

  if (members.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 leading-7 text-muted">
        {t('journey.members.empty')}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-md bg-surface px-4 shadow-soft sm:px-6">
      {members.map((member) => {
        const actionsOpen = activeMemberId === member.id
        return (
          <li className="relative flex items-center gap-3 py-4" key={member.id}>
            <Avatar label={member.displayName} src={member.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {member.displayName}
                {member.isCurrentUser ? (
                  <span className="ml-2 font-normal text-muted">
                    ({t('journey.members.you')})
                  </span>
                ) : null}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                {member.role === 'owner' ? (
                  <ShieldCheck aria-hidden="true" size={14} />
                ) : null}
                {journeyMemberRoleLabels[member.role]}
                {member.username ? ` · @${member.username}` : ''}
              </p>
            </div>
            {member.canChangeRole || member.canRemove ? (
              <button
                aria-expanded={actionsOpen}
                aria-label={t('journey.members.actionsFor', {
                  name: member.displayName,
                })}
                className="flex size-11 items-center justify-center rounded-md hover:bg-background"
                onClick={() => {
                  setActiveMemberId(actionsOpen ? null : member.id)
                }}
                type="button"
              >
                <MoreVertical aria-hidden="true" size={19} />
              </button>
            ) : null}
            {actionsOpen ? (
              <div className="absolute right-0 top-14 z-10 w-56 rounded-md border border-border bg-surface p-2 shadow-soft">
                {member.canChangeRole ? (
                  <label className="block px-2 py-2 text-xs font-semibold text-muted">
                    {t('journey.members.role')}
                    <select
                      aria-label={t('journey.members.roleFor', {
                        name: member.displayName,
                      })}
                      className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                      onChange={(event) => {
                        void onChangeRole(
                          member.id,
                          event.target.value as JourneyMemberRole,
                        )
                        setActiveMemberId(null)
                      }}
                      value={member.role}
                    >
                      <option value="owner">
                        {journeyMemberRoleLabels.owner}
                      </option>
                      <option value="editor">
                        {journeyMemberRoleLabels.editor}
                      </option>
                      <option value="member">
                        {journeyMemberRoleLabels.member}
                      </option>
                    </select>
                  </label>
                ) : null}
                {member.canRemove ? (
                  <Button
                    className="mt-1 w-full justify-start px-2"
                    onClick={() => {
                      void onRemove(member.id)
                      setActiveMemberId(null)
                    }}
                    variant="ghost"
                  >
                    <UserMinus aria-hidden="true" size={17} />
                    {t('journey.members.remove')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
