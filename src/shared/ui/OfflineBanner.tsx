import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from '@/shared/lib/use-online-status'

/** Calm strip under the header while the device is offline. */
export function OfflineBanner() {
  const { t } = useTranslation()
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div
      className="flex items-center justify-center gap-2 border-b border-border/60 bg-surface px-4 py-2 text-sm text-muted"
      data-testid="offline-banner"
      role="status"
    >
      <WifiOff aria-hidden="true" size={16} />
      <span>{t('states.offlineBanner')}</span>
    </div>
  )
}
