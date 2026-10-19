import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { CAPTION_MAX_LENGTH } from '@/features/journey-workspace/lib/caption'

/**
 * Inline caption editing. Raising `startSignal` (e.g. on the C shortcut)
 * switches to the input, like clicking the caption does.
 */
export function CaptionEditor({
  edits,
  item,
  startSignal = 0,
}: {
  edits: WorkspaceEdits
  item: MediaItem
  startSignal?: number
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [tooLong, setTooLong] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const saving = useRef(false)

  const lastSignal = useRef(startSignal)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (startSignal === lastSignal.current) return
    lastSignal.current = startSignal
    cancelled.current = false
    setDraft(item.caption ?? '')
    setTooLong(false)
    setEditing(true)
  }, [startSignal, item.caption])

  const commit = async () => {
    if (saving.current) return
    saving.current = true
    const result = await edits.saveCaption(item, draft).finally(() => {
      saving.current = false
    })
    if (result.ok) {
      setEditing(false)
      setTooLong(false)
    } else {
      setTooLong(true)
    }
  }

  if (!editing) {
    return (
      <button
        className="min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-surface"
        type="button"
        onClick={() => {
          cancelled.current = false
          setDraft(item.caption ?? '')
          setTooLong(false)
          setEditing(true)
        }}
      >
        {item.caption !== null ? (
          <span className="line-clamp-2 break-words">{item.caption}</span>
        ) : (
          <span className="text-muted">{t('workspace.addCaption')}</span>
        )}
        <span className="sr-only"> ({t('workspace.caption')})</span>
      </button>
    )
  }
  return (
    <div className="w-full">
      <input
        aria-invalid={tooLong}
        aria-label={t('workspace.caption')}
        className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        ref={inputRef}
        type="text"
        value={draft}
        onBlur={() => {
          if (cancelled.current) return
          void commit()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          setTooLong(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit()
          } else if (event.key === 'Escape') {
            cancelled.current = true
            setEditing(false)
            setTooLong(false)
          }
        }}
      />
      {tooLong ? (
        <p className="px-3 text-xs text-destructive" role="alert">
          {t('workspace.captionTooLong', { max: CAPTION_MAX_LENGTH })}
        </p>
      ) : null}
    </div>
  )
}
