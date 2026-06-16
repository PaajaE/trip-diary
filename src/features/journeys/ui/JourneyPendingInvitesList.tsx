import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  journeyMemberRoleLabels,
  type JourneyPendingInvite,
} from '@/entities/journey/model/journey-member'
import { Button } from '@/shared/ui/Button'

interface JourneyPendingInvitesListProps {
  invites: JourneyPendingInvite[]
  onRevoke: (inviteId: string) => Promise<void> | void
}

export function JourneyPendingInvitesList({
  invites,
  onRevoke,
}: JourneyPendingInvitesListProps) {
  const { t } = useTranslation()

  if (invites.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 leading-7 text-muted">
        {t('journey.members.noPendingInvites')}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-md bg-surface px-4 shadow-soft sm:px-6">
      {invites.map((invite) => (
        <li
          className="flex items-center justify-between gap-3 py-4"
          key={invite.id}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{invite.email}</p>
            <p className="mt-1 text-xs text-muted">
              {journeyMemberRoleLabels[invite.role]} ·{' '}
              {t('journey.members.expiresAt', {
                date: new Date(invite.expiresAt).toLocaleDateString('cs-CZ'),
              })}
            </p>
          </div>
          <Button
            aria-label={t('journey.members.revokeInviteFor', {
              email: invite.email,
            })}
            onClick={() => void onRevoke(invite.id)}
            variant="ghost"
          >
            <X aria-hidden="true" size={17} />
            {t('journey.members.revokeInvite')}
          </Button>
        </li>
      ))}
    </ul>
  )
}
