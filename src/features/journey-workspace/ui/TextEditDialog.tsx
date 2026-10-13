import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BODY_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  codePointLength,
  normalizeBody,
  normalizeMomentTitle,
  normalizeSegmentTitle,
  type TextError,
} from '@/features/journey-workspace/lib/text-edit'
import {
  WorkspaceDialog,
  dialogButton,
} from '@/features/journey-workspace/ui/WorkspaceDialog'

export interface TextValues {
  body: string
  title: string | null
}

interface TextEditDialogProps {
  heading: string
  initialBody: string
  /** Null for a moment without a title. */
  initialTitle: string | null
  onClose: () => void
  /** Resolves true when the change was saved (the dialog then closes). */
  onSave: (values: TextValues) => Promise<boolean>
  /** Segments need a title; moments may have none. */
  titleRequired: boolean
}

const FIELD =
  'mt-1 block min-h-10 w-full rounded-md border border-border bg-background px-3 py-2'

export function TextEditDialog({
  heading,
  initialBody,
  initialTitle,
  onClose,
  onSave,
  titleRequired,
}: TextEditDialogProps) {
  const { t } = useTranslation()
  const ids = useId()
  const [title, setTitle] = useState(initialTitle ?? '')
  const [body, setBody] = useState(initialBody)
  const [error, setError] = useState<TextError | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const dirty = title !== (initialTitle ?? '') || body !== initialBody

  useEffect(() => {
    const node = bodyRef.current
    if (node === null) return
    node.style.height = 'auto'
    node.style.height = `${String(node.scrollHeight)}px`
  }, [body])

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const save = async () => {
    if (savingRef.current) return
    const titleResult = titleRequired
      ? normalizeSegmentTitle(title)
      : normalizeMomentTitle(title)
    if (!titleResult.ok) {
      setError(titleResult.reason)
      return
    }
    const bodyResult = normalizeBody(body)
    if (!bodyResult.ok) {
      setError(bodyResult.reason)
      return
    }
    setError(null)
    if (
      titleResult.value === initialTitle &&
      bodyResult.value === initialBody
    ) {
      onClose()
      return
    }
    savingRef.current = true
    setSaving(true)
    const ok = await onSave({
      body: bodyResult.value,
      title: titleResult.value,
    }).finally(() => {
      savingRef.current = false
      setSaving(false)
    })
    if (ok) onClose()
  }

  const onFieldKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void save()
    }
  }

  const titleErrorId = `${ids}-title-error`
  const bodyErrorId = `${ids}-body-error`
  const counterId = `${ids}-counter`
  const titleError =
    error === 'title_required' || error === 'title_too_long' ? error : null
  const bodyError = error === 'body_too_long' ? error : null
  const bodyLength = codePointLength(body)

  return (
    <WorkspaceDialog title={heading} onClose={requestClose}>
      <div className="mt-3 space-y-3">
        <div>
          <label className="text-sm font-semibold" htmlFor={`${ids}-title`}>
            {t('workspace.textTitle')}
          </label>
          <input
            aria-describedby={titleError !== null ? titleErrorId : undefined}
            aria-invalid={titleError !== null}
            className={FIELD}
            id={`${ids}-title`}
            placeholder={
              titleRequired ? undefined : t('workspace.textTitleOptional')
            }
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
            }}
            onKeyDown={onFieldKeyDown}
          />
          {titleError !== null ? (
            <p
              className="mt-1 text-sm text-red-600"
              id={titleErrorId}
              role="alert"
            >
              {titleError === 'title_required'
                ? t('workspace.textTitleRequired')
                : t('workspace.textTitleTooLong', { max: TITLE_MAX_LENGTH })}
            </p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor={`${ids}-body`}>
            {t('workspace.textBody')}
          </label>
          <textarea
            aria-describedby={
              bodyError !== null ? `${counterId} ${bodyErrorId}` : counterId
            }
            aria-invalid={bodyError !== null}
            className={`${FIELD} max-h-[40vh] min-h-32 resize-none overflow-y-auto`}
            id={`${ids}-body`}
            ref={bodyRef}
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
            }}
            onKeyDown={onFieldKeyDown}
          />
          <p className="mt-1 text-xs text-muted" id={counterId}>
            {t('workspace.textCounter', {
              count: bodyLength,
              max: BODY_MAX_LENGTH,
            })}
          </p>
          {bodyError !== null ? (
            <p
              className="mt-1 text-sm text-red-600"
              id={bodyErrorId}
              role="alert"
            >
              {t('workspace.textBodyTooLong', { max: BODY_MAX_LENGTH })}
            </p>
          ) : null}
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
          <button
            className={dialogButton}
            disabled={saving}
            type="button"
            onClick={() => {
              void save()
            }}
          >
            {t('workspace.textSave')}
          </button>
        </div>
      </div>
    </WorkspaceDialog>
  )
}
