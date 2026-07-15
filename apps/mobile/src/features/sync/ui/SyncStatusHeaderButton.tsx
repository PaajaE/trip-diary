import { useState } from 'react'
import { Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSyncStatusPresentation } from '@/features/sync/use-sync-status-presentation'
import { SyncStatusDetailModal } from '@/features/sync/ui/SyncStatusDetailModal'
import { SyncStatusIndicator } from '@/features/sync/ui/SyncStatusIndicator'

export function SyncStatusHeaderButton() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const presentation = useSyncStatusPresentation()

  return (
    <>
      <Pressable
        accessibilityHint={t('sync.mobile.openDetails')}
        accessibilityLabel={presentation.accessibilityLabel}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
      >
        <SyncStatusIndicator
          isProcessing={presentation.isProcessing}
          viewModel={presentation.viewModel}
        />
      </Pressable>
      <SyncStatusDetailModal onClose={() => setOpen(false)} open={open} />
    </>
  )
}
