import { ShareActions } from '@/features/sharing/ui/ShareActions'
import { Avatar } from '@/shared/ui/Avatar'
import { useTranslation } from 'react-i18next'

interface PublicSpaceHeaderProps {
  avatarUrl?: string | null
  bio?: string | null
  handle: string
  name: string
  shareText: string
  shareUrl: string
}

function shouldShowHandle(name: string, handle: string): boolean {
  const normalizedName = name.trim().toLowerCase()
  const normalizedHandle = handle.trim().toLowerCase()
  return (
    normalizedHandle !== '' &&
    normalizedName !== normalizedHandle &&
    normalizedName !== `@${normalizedHandle}`
  )
}

export function PublicSpaceHeader({
  avatarUrl,
  bio,
  handle,
  name,
  shareText,
  shareUrl,
}: PublicSpaceHeaderProps) {
  const { t } = useTranslation()
  const showHandle = shouldShowHandle(name, handle)
  const displayName = name.trim() === '' ? `@${handle}` : name

  return (
    <header className="overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-soft">
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <Avatar
            className="size-16 text-xl sm:size-20 sm:text-2xl"
            label={displayName}
            src={avatarUrl}
          />
          <div className="min-w-0 pt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              {t('publicSpace.tagline')}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {displayName}
            </h1>
            {showHandle ? (
              <p className="mt-2 text-sm text-muted">@{handle}</p>
            ) : null}
            {bio === undefined || bio === null || bio === '' ? null : (
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
                {bio}
              </p>
            )}
          </div>
        </div>
        <ShareActions
          className="shrink-0 self-start sm:pt-1"
          shareText={shareText}
          shareUrl={shareUrl}
          title={displayName}
          variant="compact"
        />
      </div>
    </header>
  )
}
