import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { updateEntry } from '@/entities/entry/api/entry-mutation.repository'
import type { Entry } from '@/entities/entry/model/entry'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface EditEntryFormProps {
  creatorId: string
  entry: Entry
  onCancel: () => void
  onUpdated: (entry: Entry) => void | Promise<void>
}

const BODY_MAX_LENGTH = 50_000

export function EditEntryForm({
  creatorId,
  entry,
  onCancel,
  onUpdated,
}: EditEntryFormProps) {
  const { t } = useTranslation()
  const savingRef = useRef(false)
  const [title, setTitle] = useState(entry.title)
  const [body, setBody] = useState(entry.body)
  const [type, setType] = useState(entry.type)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    title !== entry.title || body !== entry.body || type !== entry.type
  const saveDisabled = saving || !dirty

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
      const updated = await updateEntry(entry.id, creatorId, {
        body,
        eventAt: entry.eventAt,
        language: entry.language,
        title: title.trim() === '' ? entry.title : title.trim(),
        type,
        visibility: entry.visibility,
      })
      try {
        if (await canAutomaticallySync()) {
          await syncPendingOperations()
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
    event: KeyboardEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
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
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h2 className="text-lg font-semibold">{t('entry.editTitle')}</h2>
      <Input
        disabled={saving}
        label={t('entry.title')}
        maxLength={160}
        onChange={(event) => {
          setTitle(event.target.value)
        }}
        onKeyDown={handleEditorKeyDown}
        value={title}
      />
      <label className="block text-sm font-medium">
        {t('entry.body')}
        <textarea
          className="mt-2 min-h-40 w-full resize-none rounded-md border border-border bg-background px-3 py-3 text-base leading-7 outline-none focus:border-primary"
          disabled={saving}
          onChange={(event) => {
            setBody(event.target.value)
          }}
          onKeyDown={handleEditorKeyDown}
          value={body}
        />
      </label>
      <label className="block text-sm font-medium">
        {t('entry.typeLabel')}
        <select
          className="mt-2 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
          disabled={saving}
          onChange={(event) => {
            setType(event.target.value as Entry['type'])
          }}
          onKeyDown={handleEditorKeyDown}
          value={type}
        >
          <option value="story">{t('entry.type.story')}</option>
          <option value="tip">{t('entry.type.tip')}</option>
          <option value="note">{t('entry.type.note')}</option>
          <option value="place">{t('entry.type.place')}</option>
        </select>
      </label>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
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
