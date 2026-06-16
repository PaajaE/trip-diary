import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import type { JourneyMemberRole } from '@/entities/journey/model/journey-member'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

const addMemberFormSchema = z.object({
  role: z.enum(['editor', 'member']),
  username: z.string().trim().min(3).max(30),
})

type AddMemberFormValues = z.infer<typeof addMemberFormSchema>

interface AddJourneyMemberFormProps {
  onSubmit: (values: AddMemberFormValues) => Promise<void>
}

export function AddJourneyMemberForm({ onSubmit }: AddJourneyMemberFormProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const form = useForm<AddMemberFormValues>({
    defaultValues: { role: 'editor', username: '' },
    resolver: zodResolver(addMemberFormSchema),
  })

  async function handleSubmit(values: AddMemberFormValues) {
    setSubmitError(null)
    try {
      await onSubmit(values)
      form.reset({ role: values.role, username: '' })
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t('journey.members.addError'),
      )
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => void form.handleSubmit(handleSubmit)(event)}
    >
      <Input
        error={form.formState.errors.username?.message}
        label={t('journey.members.username')}
        {...form.register('username')}
      />
      <label className="block text-sm font-medium">
        {t('journey.members.role')}
        <select
          className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
          {...form.register('role')}
        >
          <option value="editor">{t('journey.members.roleEditor')}</option>
          <option value="member">{t('journey.members.roleMember')}</option>
        </select>
      </label>
      <Button
        className="w-full"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {t('journey.members.add')}
      </Button>
      {submitError === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      )}
    </form>
  )
}

export type { AddMemberFormValues, JourneyMemberRole }
