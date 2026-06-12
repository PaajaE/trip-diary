import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { createJourney } from '@/entities/journey/api/journey.repository'
import {
  createJourneySchema,
  type CreateJourneyInput,
} from '@/entities/journey/model/journey'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface CreateJourneyFormProps {
  creatorId: string
  onCreated: (journeyId: string) => void
  spaceId: string
}

export function CreateJourneyForm({
  creatorId,
  onCreated,
  spaceId,
}: CreateJourneyFormProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const form = useForm<CreateJourneyInput>({
    defaultValues: { endsAt: null, startsAt: null, summary: '', title: '' },
    resolver: zodResolver(createJourneySchema),
  })

  async function handleSubmit(input: CreateJourneyInput) {
    setSubmitError(null)
    try {
      onCreated(await createJourney(creatorId, spaceId, input))
    } catch {
      setSubmitError(t('journey.createError'))
    }
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => void form.handleSubmit(handleSubmit)(event)}
    >
      <Input
        error={form.formState.errors.title?.message}
        label={t('journey.title')}
        {...form.register('title')}
      />
      <label className="block text-sm font-medium">
        {t('journey.summary')}
        <textarea
          className="mt-2 min-h-32 w-full rounded-md border border-border bg-surface px-3 py-3 text-base font-normal outline-none focus:border-primary"
          {...form.register('summary')}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label={t('journey.startsAt')}
          type="date"
          {...form.register('startsAt', {
            setValueAs: (value: string) => value || null,
          })}
        />
        <Input
          error={form.formState.errors.endsAt?.message}
          label={t('journey.endsAt')}
          type="date"
          {...form.register('endsAt', {
            setValueAs: (value: string) => value || null,
          })}
        />
      </div>
      <Button
        className="w-full"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {t('journey.create')}
      </Button>
      {submitError === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}
    </form>
  )
}
