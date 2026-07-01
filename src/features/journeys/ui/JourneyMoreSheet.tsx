import { ExternalLink, Leaf, Lightbulb, Link2, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'

interface JourneyMoreSheetProps {
  canEdit: boolean
  onClose: () => void
  onCopyShareLink?: () => void
  onManageTrip?: () => void
  onOpenGuides: () => void
  onOpenNature: () => void
  open: boolean
  shareUrl?: string
}

export function JourneyMoreSheet({
  canEdit,
  onClose,
  onCopyShareLink,
  onManageTrip,
  onOpenGuides,
  onOpenNature,
  open,
  shareUrl,
}: JourneyMoreSheetProps) {
  const { t } = useTranslation()

  return (
    <SoftBottomSheet
      closeLabel={t('nature.strip.close')}
      onClose={onClose}
      open={open}
      title={t('journey.moreTitle')}
    >
      <nav className="flex flex-col">
        <MoreRow
          icon={Leaf}
          label={t('journey.moreNature')}
          onClick={() => {
            onOpenNature()
            onClose()
          }}
        />
        <MoreRow
          icon={Lightbulb}
          label={t('journey.guides')}
          onClick={() => {
            onOpenGuides()
            onClose()
          }}
        />
        {canEdit && onManageTrip !== undefined ? (
          <MoreRow
            icon={Settings2}
            label={t('journey.manageTrip')}
            onClick={() => {
              onManageTrip()
              onClose()
            }}
          />
        ) : null}
        {shareUrl !== undefined && onCopyShareLink !== undefined ? (
          <MoreRow
            icon={Link2}
            label={t('journey.moreCopyLink')}
            onClick={() => {
              onCopyShareLink()
              onClose()
            }}
          />
        ) : null}
        {shareUrl !== undefined ? (
          <a
            className="mt-1 inline-flex min-h-11 items-center gap-3 rounded-xl px-1 text-sm text-muted hover:text-foreground"
            href={shareUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" size={18} />
            {t('journey.moreOpenPublic')}
          </a>
        ) : null}
      </nav>
    </SoftBottomSheet>
  )
}

function MoreRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Leaf
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left text-sm font-medium transition hover:bg-background"
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="text-primary/80" size={18} />
      {label}
    </button>
  )
}
