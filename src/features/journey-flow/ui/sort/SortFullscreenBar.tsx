import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { HEAD_BTN } from '@/features/journey-flow/ui/sort/SortHeader'
import { ShortcutsHint } from '@/features/journey-flow/ui/sort/ShortcutsHint'
import { ShowControlsButton } from '@/features/journey-flow/ui/sort/ShowControlsButton'
import { cn } from '@/shared/lib/cn'

/**
 * Controls of the full screen sorting (M-TrideniCela, W-BezRuseni): the
 * hint, close and the three decisions; when hidden, a small visible button
 * brings them back.
 */
export function SortFullscreenBar({
  decisions,
  onClose,
  onShow,
  visible,
}: {
  decisions: ReactNode
  onClose: () => void
  onShow: () => void
  visible: boolean
}) {
  const { t } = useTranslation()
  if (!visible) return <ShowControlsButton onShow={onShow} />
  return (
    <div className="absolute inset-x-0 bottom-0 space-y-2 bg-black/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <p className="text-center text-xs text-white/80">
        {t('flow.sort.fullscreenHint')}
      </p>
      <div className="flex items-center gap-2">
        <button
          aria-label={t('flow.sort.fullscreenExit')}
          className={cn(HEAD_BTN, 'bg-white/10')}
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" size={20} />
        </button>
        <div className="flex-1">{decisions}</div>
      </div>
      <ShortcutsHint keys={['trash', 'keep', 'star', 'fullscreen', 'close']} />
    </div>
  )
}
