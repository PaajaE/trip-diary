import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

/**
 * Full screen with hidden controls: a small, always visible button to get
 * them back (a tap on the photo does the same; this one is findable).
 */
export function ShowControlsButton({
  className,
  onShow,
}: {
  className?: string
  onShow: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      aria-label={t('flow.sort.showControls')}
      className={cn(
        'absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-10 flex size-11 items-center justify-center rounded-full bg-black/60 text-white/90 shadow-soft hover:bg-black/80',
        className,
      )}
      data-testid="show-controls"
      type="button"
      onClick={onShow}
    >
      <SlidersHorizontal aria-hidden="true" size={20} />
    </button>
  )
}
