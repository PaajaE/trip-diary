import { UsersRound } from 'lucide-react'
import { ShareActions } from '@/features/sharing/ui/ShareActions'
import { Avatar } from '@/shared/ui/Avatar'

interface PublicSpaceHeaderProps {
  avatarUrl?: string | null
  bio?: string | null
  handle: string
  name: string
  shareText: string
  shareUrl: string
}

export function PublicSpaceHeader({
  avatarUrl,
  bio,
  handle,
  name,
  shareText,
  shareUrl,
}: PublicSpaceHeaderProps) {
  return (
    <header className="flex flex-col gap-7 border-b border-border pb-10 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Avatar
          className="size-20 text-2xl sm:size-24"
          label={name}
          src={avatarUrl}
        />
        <p className="mt-6 flex items-center gap-2 text-sm font-medium text-accent">
          <UsersRound aria-hidden="true" size={16} />@{handle}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
          {name}
        </h1>
        {bio === undefined || bio === null || bio === '' ? null : (
          <p className="mt-5 max-w-2xl leading-7 text-muted">{bio}</p>
        )}
      </div>
      <ShareActions
        className="w-full shrink-0 sm:w-auto"
        shareText={shareText}
        shareUrl={shareUrl}
        title={name}
      />
    </header>
  )
}
