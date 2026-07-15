import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { updateEntry } from '@/entities/entry/api/entry-mutation.repository'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import {
  updateEntrySchema,
  type Entry,
  type UpdateEntryInput,
} from '@/entities/entry/model/entry'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface InlineMomentEditorProps {
  creatorId: string
  entryId: string
  onCancel: () => void
  onUpdated: (entry: Entry) => void
}

export function InlineMomentEditor({
  creatorId,
  entryId,
  onCancel,
  onUpdated,
}: InlineMomentEditorProps) {
  const { t } = useTranslation()
  const entryQuery = useQuery({
    queryFn: () => getLocalEntry(entryId),
    queryKey: entryQueryKeys.inlineEdit(entryId),
  })
  const entry = entryQuery.data

  const form = useForm<UpdateEntryInput>({
    defaultValues: {
      body: '',
      eventAt: new Date().toISOString(),
      language: 'cs',
      title: '',
      type: 'story',
      visibility: 'public',
    },
    resolver: zodResolver(updateEntrySchema),
  })

  useEffect(() => {
    if (entry === null || entry === undefined) {
      return
    }
    form.reset({
      body: entry.body,
      eventAt: entry.eventAt,
      language: entry.language,
      title: entry.title,
      type: entry.type,
      visibility: entry.visibility,
    })
  }, [entry, form])

  async function handleSubmit(input: UpdateEntryInput) {
    const updated = await updateEntry(entryId, creatorId, input)
    try {
      if (await canAutomaticallySync()) {
        void syncPendingOperations().catch(() => {
          // Background sync can retry later.
        })
      }
    } catch {
      // Local changes are safe and can be synchronized later.
    }
    onUpdated(updated)
  }

  if (entryQuery.isLoading || entry === undefined) {
    return <p className="mt-4 text-sm text-muted">{t('entry.loading')}</p>
  }

  if (entry === null) {
    return null
  }

  return (
    <form
      className="mt-4 space-y-4 border-t border-border/60 pt-4"
      onSubmit={(event) => {
        void form.handleSubmit(handleSubmit)(event)
      }}
    >
      <Input
        label={t('entry.title')}
        {...form.register('title')}
        error={form.formState.errors.title?.message}
      />
      <label className="block text-sm font-medium">
        {t('entry.body')}
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          {...form.register('body')}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting
            ? t('entry.sync.syncing')
            : t('entry.saveChanges')}
        </Button>
        <Button onClick={onCancel} type="button" variant="secondary">
          {t('entry.cancelEdit')}
        </Button>
      </div>
    </form>
  )
}
