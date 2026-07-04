import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { copyText, shareUrl } from '@/shared/lib/share'
import { cn } from '@/shared/lib/cn'

interface ShareIconButtonProps {
  className?: string
  disabled?: boolean
  onDisabledClick?: () => void
  shareText: string
  shareUrl: string
  title: string
}

export function ShareIconButton({
  className,
  disabled = false,
  onDisabledClick,
  shareText,
  shareUrl: url,
  title,
}: ShareIconButtonProps) {
  const { t } = useTranslation()

  return (
    <button
      aria-disabled={disabled}
      aria-label={t('reader.shareSystem')}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground',
        disabled && 'opacity-40',
        className,
      )}
      onClick={() => {
        if (disabled) {
          onDisabledClick?.()
          return
        }
        void shareUrl(url, title)
          .catch(() => copyText(shareText))
          .catch(() => copyText(url))
      }}
      type="button"
    >
      <Share2 aria-hidden="true" size={16} />
    </button>
  )
}
