import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import {
  createEntrySchema,
  type CreateEntryInput,
} from '@/entities/entry/model/entry'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface CreateEntryFormProps {
  creatorId: string
  onCreated: (entryId: string) => void
}

export function CreateEntryForm({
  creatorId,
  onCreated,
}: CreateEntryFormProps) {
  const { t, i18n } = useTranslation()
  const form = useForm<CreateEntryInput>({
    resolver: zodResolver(createEntrySchema),
    defaultValues: {
      body: '',
      eventAt: new Date().toISOString(),
      language: i18n.language === 'en' ? 'en' : 'cs',
      title: '',
      type: 'story',
      visibility: 'public',
    },
  })

  async function handleSubmit(input: CreateEntryInput) {
    const entry = await createLocalEntry(creatorId, input)
    try {
      await syncPendingOperations()
    } catch {
      // The local draft is safe and can be synchronized later.
    }
    onCreated(entry.id)
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => void form.handleSubmit(handleSubmit)(event)}
    >
      <Input
        error={form.formState.errors.title?.message}
        label={t('entry.title')}
        {...form.register('title')}
      />
      <label className="block text-sm font-medium">
        {t('entry.body')}
        <textarea
          className="mt-2 min-h-40 w-full rounded-md border border-border bg-surface px-3 py-3 text-base font-normal outline-none focus:border-primary"
          {...form.register('body')}
        />
      </label>
      <Button
        className="w-full"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {t('entry.publish')}
      </Button>
    </form>
  )
}
