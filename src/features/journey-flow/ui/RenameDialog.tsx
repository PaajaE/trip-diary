import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_TITLE_LENGTH } from '@/features/journey-flow/api/flow-actions'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'

/** "Přejmenovat": a manual title (it also locks the stop). */
export function RenameDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: string
  onClose: () => void
  onSave: (title: string) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  const valid = value.trim() !== '' && value.trim().length <= MAX_TITLE_LENGTH
  return (
    <WorkspaceDialog title={t('flow.review.rename')} onClose={onClose}>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) onSave(value.trim())
        }}
      >
        <label className="block text-sm font-medium">
          {t('flow.screen.review.renameLabel')}
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base"
            maxLength={MAX_TITLE_LENGTH}
            type="text"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
            }}
          />
        </label>
        <p className="text-xs text-muted">{t('flow.review.locksHint')}</p>
        <div className="flex justify-end gap-2">
          <button className={dialogButton} type="button" onClick={onClose}>
            {t('flow.split.cancel')}
          </button>
          <button
            className={`${dialogButton} bg-primary text-primary-foreground`}
            disabled={!valid}
            type="submit"
          >
            {t('flow.screen.review.save')}
          </button>
        </div>
      </form>
    </WorkspaceDialog>
  )
}
