import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { updateEntryContent } from '@/entities/entry/api/entry-mutation.repository'
import type { Entry } from '@/entities/entry/model/entry'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/lib/cn'

const BODY_MIN_HEIGHT_PX = 160
const BODY_MAX_LENGTH = 50_000
const TITLE_MAX_LENGTH = 160

interface InlineMomentEditorProps {
  creatorId: string
  entryId: string
  initialBody: string
  initialTitle: string
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  onUpdated: (entry: Entry) => void | Promise<void>
}

export function InlineMomentEditor({
  creatorId,
  entryId,
  initialBody,
  initialTitle,
  onCancel,
  onDirtyChange,
  onUpdated,
}: InlineMomentEditorProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const bodyId = useId()
  const titleRef = useRef<HTMLInputElement | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const savingRef = useRef(false)
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = title !== initialTitle || body !== initialBody
  const saveDisabled = saving || !dirty

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    const titleField = titleRef.current
    const bodyField = bodyRef.current
    if (titleField === null || bodyField === null) {
      return
    }

    autosizeTextarea(bodyField, BODY_MIN_HEIGHT_PX)

    if (initialTitle.trim() === '') {
      titleField.focus()
      return
    }

    bodyField.focus()
    const cursor = bodyField.value.length
    bodyField.setSelectionRange(cursor, cursor)
  }, [initialTitle])

  useEffect(() => {
    if (!dirty) {
      return
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [dirty])

  function handleCancel() {
    if (saving) {
      return
    }
    if (dirty && !window.confirm(t('entry.unsavedChangesConfirm'))) {
      return
    }
    onCancel()
  }

  async function save() {
    if (savingRef.current || !dirty) {
      return
    }
    if (body.length > BODY_MAX_LENGTH) {
      setError(t('entry.saveFailed'))
      return
    }

    savingRef.current = true
    setSaving(true)
    setError(null)

    try {
      const updated = await updateEntryContent(entryId, creatorId, {
        body,
        title: title.slice(0, TITLE_MAX_LENGTH),
      })
      try {
        if (await canAutomaticallySync()) {
          void syncPendingOperations().catch(() => {
            // Background sync can retry later.
          })
        }
      } catch {
        // Local changes are safe and can be synchronized later.
      }
      await onUpdated(updated)
    } catch {
      setError(t('entry.saveFailed'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function handleEditorKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
      return
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void save()
    }
  }

  return (
    <form
      aria-busy={saving}
      className="mt-2"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <label className="sr-only" htmlFor={titleId}>
        {t('entry.title')}
      </label>
      <input
        autoComplete="off"
        className="w-full min-w-0 bg-transparent text-lg font-semibold outline-none placeholder:text-muted/70 focus:border-b focus:border-primary/40"
        disabled={saving}
        id={titleId}
        maxLength={TITLE_MAX_LENGTH}
        onChange={(event) => {
          setTitle(event.target.value)
        }}
        onKeyDown={handleEditorKeyDown}
        placeholder={t('entry.titlePlaceholder')}
        ref={titleRef}
        value={title}
      />
      <label className="sr-only" htmlFor={bodyId}>
        {t('entry.body')}
      </label>
      <textarea
        className={cn(
          'mt-3 min-h-40 w-full min-w-0 resize-none overflow-hidden bg-transparent text-base leading-7 text-foreground/90 outline-none placeholder:text-muted/70',
          'focus:ring-0',
        )}
        disabled={saving}
        id={bodyId}
        onChange={(event) => {
          setBody(event.target.value)
          autosizeTextarea(event.currentTarget, BODY_MIN_HEIGHT_PX)
        }}
        onKeyDown={handleEditorKeyDown}
        placeholder={t('entry.bodyPlaceholder')}
        ref={bodyRef}
        value={body}
      />
      {error === null ? null : (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          className="w-full sm:w-auto"
          disabled={saveDisabled}
          type="submit"
        >
          {saving ? t('entry.saving') : t('entry.saveChanges')}
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={saving}
          onClick={handleCancel}
          type="button"
          variant="secondary"
        >
          {t('entry.cancelEdit')}
        </Button>
      </div>
    </form>
  )
}

function autosizeTextarea(element: HTMLTextAreaElement, minHeightPx: number) {
  element.style.height = 'auto'
  element.style.height = `${Math.max(element.scrollHeight, minHeightPx).toString()}px`
}
