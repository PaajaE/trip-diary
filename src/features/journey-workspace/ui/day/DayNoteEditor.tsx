import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DAY_NOTE_MAX_LENGTH } from '@/entities/day-note/model/day-note'
import { codePointLength } from '@/features/journey-workspace/lib/text-edit'
import { cn } from '@/shared/lib/cn'

type Status = 'error' | 'idle' | 'saved' | 'saving' | 'tooLong'

interface DayNoteEditorProps {
  canEdit: boolean
  /** False for the undated day: it has no local_date to attach a note to. */
  dated: boolean
  /** Saves the trimmed text (empty deletes the note); resolves true on success. */
  onSave: (body: string) => Promise<boolean>
  value: string | null
}

/** "Zapis dne": one free text per day, autosaved on blur, with an explicit Save. */
export function DayNoteEditor({
  canEdit,
  dated,
  onSave,
  value,
}: DayNoteEditorProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const saved = value ?? ''

  /** Resolves true when nothing is left unsaved. */
  async function commit(): Promise<boolean> {
    const body = draft.trim()
    if (body === saved) {
      setStatus('idle')
      return true
    }
    if (codePointLength(body) > DAY_NOTE_MAX_LENGTH) {
      setStatus('tooLong')
      return false
    }
    setStatus('saving')
    const ok = await onSave(body)
    setStatus(ok ? 'saved' : 'error')
    return ok
  }

  const statusLine = (
    <span aria-live="polite" className="text-sm text-muted" role="status">
      {status === 'saved' ? t('dayDetail.noteSaved') : null}
      {status === 'error' ? t('dayDetail.noteSaveFailed') : null}
      {status === 'tooLong' ? t('dayDetail.noteTooLong') : null}
    </span>
  )

  if (!dated) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-border bg-surface px-3.5 py-3 text-sm text-muted">
        {t('dayDetail.undatedNote')}
      </p>
    )
  }

  if (!editing) {
    const filled = saved !== ''
    const className = cn(
      'mt-4 block w-full rounded-md border bg-surface px-3.5 py-3 text-left',
      filled
        ? 'reader-display whitespace-pre-line border-border text-[17px] font-normal leading-relaxed text-foreground'
        : 'border-dashed border-border text-sm text-muted',
    )
    if (!canEdit) {
      return filled ? <p className={className}>{saved}</p> : null
    }
    return (
      <>
        <button
          aria-label={t('dayDetail.noteLabel')}
          className={className}
          type="button"
          onClick={() => {
            setDraft(saved)
            setStatus('idle')
            setEditing(true)
            requestAnimationFrame(() => areaRef.current?.focus())
          }}
        >
          {filled ? saved : t('dayDetail.notePlaceholder')}
        </button>
        {statusLine}
      </>
    )
  }

  return (
    <div className="mt-4">
      <textarea
        ref={areaRef}
        aria-label={t('dayDetail.noteLabel')}
        className="reader-display min-h-28 w-full resize-y rounded-md border border-border bg-surface px-3.5 py-3 text-[17px] font-normal leading-relaxed"
        placeholder={t('dayDetail.notePlaceholder')}
        value={draft}
        onBlur={() => {
          void commit().then((ok) => {
            if (ok) setEditing(false)
          })
        }}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setDraft(saved)
            setEditing(false)
          }
        }}
      />
      <div className="mt-2 flex items-center gap-3 text-sm">
        <button
          className="rounded-sm bg-primary px-3 py-1.5 font-medium text-primary-foreground"
          type="button"
          onMouseDown={(event) => {
            // Keep the textarea focused so the click saves exactly once.
            event.preventDefault()
          }}
          onClick={() => {
            void commit().then((ok) => {
              if (ok) setEditing(false)
            })
          }}
        >
          {t('dayDetail.noteSave')}
        </button>
        {statusLine}
      </div>
    </div>
  )
}
