import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BODY_MAX_LENGTH,
  normalizeTipInput,
  TITLE_MAX_LENGTH,
  type Tip,
  type TipInput,
  type TipInputError,
} from '@/entities/tip/model/tip'
import {
  WorkspaceDialog,
  dialogButton,
} from '@/features/journey-workspace/ui/WorkspaceDialog'

const FIELD =
  'mt-1 block min-h-10 w-full rounded-md border border-border bg-background px-3 py-2'

interface TipDialogProps {
  onClose: () => void
  /** Resolves true when saved (the dialog then closes). */
  onSave: (input: TipInput) => Promise<boolean>
  /** Undefined: a new tip. */
  tip?: Tip
}

export function TipDialog({ onClose, onSave, tip }: TipDialogProps) {
  const { t } = useTranslation()
  const ids = useId()
  const initial: TipInput = {
    body: tip?.body ?? '',
    title: tip?.title ?? '',
    visibility: tip?.visibility ?? 'private',
  }
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [isPublic, setIsPublic] = useState(initial.visibility === 'public')
  const [error, setError] = useState<TipInputError | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const dirty =
    title !== initial.title ||
    body !== initial.body ||
    (isPublic ? 'public' : 'private') !== initial.visibility

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const save = async () => {
    if (savingRef.current) return
    const result = normalizeTipInput({
      body,
      title,
      visibility: isPublic ? 'public' : 'private',
    })
    if (!result.ok) {
      setError(result.reason)
      return
    }
    setError(null)
    savingRef.current = true
    setSaving(true)
    const ok = await onSave(result.value).finally(() => {
      savingRef.current = false
      setSaving(false)
    })
    if (ok) onClose()
  }

  const titleError =
    error === 'title_required' || error === 'title_too_long' ? error : null
  const bodyError = error === 'body_too_long'
  const counterId = `${ids}-counter`

  return (
    <WorkspaceDialog
      title={tip === undefined ? t('tips.newTitle') : t('tips.editTitle')}
      onClose={requestClose}
    >
      <form
        className="mt-3 space-y-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div>
          <label className="text-sm font-semibold" htmlFor={`${ids}-title`}>
            {t('tips.fieldTitle')}
          </label>
          <input
            aria-describedby={
              titleError !== null ? `${ids}-title-err` : undefined
            }
            aria-invalid={titleError !== null}
            className={FIELD}
            id={`${ids}-title`}
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
            }}
          />
          {titleError !== null ? (
            <p
              className="mt-1 text-sm text-red-600"
              id={`${ids}-title-err`}
              role="alert"
            >
              {titleError === 'title_required'
                ? t('tips.titleRequired')
                : t('tips.titleTooLong', { max: TITLE_MAX_LENGTH })}
            </p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor={`${ids}-body`}>
            {t('tips.fieldBody')}
          </label>
          <textarea
            aria-describedby={counterId}
            aria-invalid={bodyError}
            className={`${FIELD} max-h-[40vh] min-h-40 resize-y`}
            id={`${ids}-body`}
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
            }}
          />
          <p className="mt-1 text-xs text-muted" id={counterId}>
            {t('workspace.textCounter', {
              count: Array.from(body).length,
              max: BODY_MAX_LENGTH,
            })}
          </p>
          {bodyError ? (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {t('workspace.textBodyTooLong', { max: BODY_MAX_LENGTH })}
            </p>
          ) : null}
        </div>
        <div className="flex min-h-10 items-start gap-3 text-sm">
          <input
            aria-describedby={`${ids}-publish-hint`}
            checked={isPublic}
            className="mt-1 size-4"
            id={`${ids}-publish`}
            type="checkbox"
            onChange={(event) => {
              setIsPublic(event.target.checked)
            }}
          />
          <div>
            <label className="font-semibold" htmlFor={`${ids}-publish`}>
              {t('tips.publish')}
            </label>
            <p className="text-muted" id={`${ids}-publish-hint`}>
              {t('tips.publishHint')}
            </p>
          </div>
        </div>
        {confirmDiscard ? (
          <div className="rounded-md border border-border p-3" role="alert">
            <p className="text-sm">{t('workspace.textDiscardPrompt')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={dialogButton} type="button" onClick={onClose}>
                {t('workspace.textDiscard')}
              </button>
              <button
                className={dialogButton}
                type="button"
                onClick={() => {
                  setConfirmDiscard(false)
                }}
              >
                {t('workspace.textKeepEditing')}
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button className={dialogButton} type="button" onClick={requestClose}>
            {t('common.cancel')}
          </button>
          <button className={dialogButton} disabled={saving} type="submit">
            {t('workspace.textSave')}
          </button>
        </div>
      </form>
    </WorkspaceDialog>
  )
}
