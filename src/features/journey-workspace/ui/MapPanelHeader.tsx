import { Maximize2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

const ICON_BUTTON =
  'inline-flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-primary hover:bg-sunk'
const SEGMENT =
  'h-8 min-w-9 px-2 text-[12.5px] font-semibold text-primary hover:bg-sunk'

/** Header of the map panel: label, quick widths, full-screen and hide. */
export function MapPanelHeader({
  halfActive,
  onExpand,
  onHalf,
  onHide,
  onThird,
  thirdActive,
}: {
  halfActive: boolean
  onExpand: () => void
  onHalf: () => void
  onHide: () => void
  onThird: () => void
  thirdActive: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {t('workspace.mapHeading')}
      </h2>
      <div
        aria-label={t('workspace.layout.quickWidth')}
        className="flex overflow-hidden rounded-lg border border-border bg-surface"
        role="group"
      >
        <button
          aria-label={t('workspace.layout.mapThird')}
          aria-pressed={thirdActive}
          className={cn(SEGMENT, thirdActive && 'bg-primary-soft')}
          type="button"
          onClick={onThird}
        >
          ⅓
        </button>
        <button
          aria-label={t('workspace.layout.mapHalf')}
          aria-pressed={halfActive}
          className={cn(
            SEGMENT,
            'border-l border-border',
            halfActive && 'bg-primary-soft',
          )}
          type="button"
          onClick={onHalf}
        >
          ½
        </button>
      </div>
      <button
        aria-label={t('workspace.layout.mapExpand')}
        className={ICON_BUTTON}
        title={t('workspace.layout.mapExpand')}
        type="button"
        onClick={onExpand}
      >
        <Maximize2 aria-hidden="true" size={15} />
      </button>
      <button
        aria-label={t('workspace.layout.mapHide')}
        className={ICON_BUTTON}
        title={`${t('workspace.layout.mapHide')} ( M )`}
        type="button"
        onClick={onHide}
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  )
}
