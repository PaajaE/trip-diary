import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { updateEntry } from '@/entities/entry/api/entry-mutation.repository'
import {
  updateEntrySchema,
  type Entry,
  type UpdateEntryInput,
} from '@/entities/entry/model/entry'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface EditEntryFormProps {
  creatorId: string
  entry: Entry
  onCancel: () => void
  onUpdated: (entry: Entry) => void
}

export function EditEntryForm({
  creatorId,
  entry,
  onCancel,
  onUpdated,
}: EditEntryFormProps) {
  const { t } = useTranslation()
  const form = useForm<UpdateEntryInput>({
    resolver: zodResolver(updateEntrySchema),
    defaultValues: {
      body: entry.body,
      eventAt: entry.eventAt,
      language: entry.language,
      title: entry.title,
      type: entry.type,
      visibility: entry.visibility,
    },
  })

  async function handleSubmit(input: UpdateEntryInput) {
    const updated = await updateEntry(entry.id, creatorId, input)
    try {
      if (await canAutomaticallySync()) {
        await syncPendingOperations()
      }
    } catch {
      // Local changes are safe and can be synchronized later.
    }
    onUpdated(updated)
  }

  return (
    <form
      className="mt-8 space-y-5 rounded-2xl border border-border bg-surface p-5"
      onSubmit={(event) => {
        void form.handleSubmit(handleSubmit)(event)
      }}
    >
      <h2 className="text-lg font-semibold">{t('entry.editTitle')}</h2>
      <Input
        label={t('entry.title')}
        {...form.register('title')}
        error={form.formState.errors.title?.message}
      />
      <label className="block text-sm font-medium">
        {t('entry.body')}
        <textarea
          className="mt-2 min-h-32 w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          {...form.register('body')}
        />
      </label>
      <label className="block text-sm font-medium">
        {t('entry.typeLabel')}
        <select
          className="mt-2 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
          {...form.register('type')}
        >
          <option value="story">{t('entry.type.story')}</option>
          <option value="tip">{t('entry.type.tip')}</option>
          <option value="note">{t('entry.type.note')}</option>
          <option value="place">{t('entry.type.place')}</option>
        </select>
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          className="w-full sm:w-auto"
          disabled={form.formState.isSubmitting}
        >
          {t('entry.saveChanges')}
        </Button>
        <Button
          className="w-full sm:w-auto"
          onClick={onCancel}
          type="button"
          variant="secondary"
        >
          {t('entry.cancelEdit')}
        </Button>
      </div>
    </form>
  )
}
