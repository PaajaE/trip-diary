import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, CheckCircle2 } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { Profile } from '@/entities/profile/model/profile'
import {
  profileSettingsSchema,
  type PreferredLocale,
  type ProfileSettingsSubmission,
  type ProfileSettingsValues,
} from '@/features/profile/model/profile-settings'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface ProfileSettingsFormProps {
  onSave: (submission: ProfileSettingsSubmission) => Promise<void>
  preferredLocale?: PreferredLocale
  profile: Profile
  userId: string
}

export function ProfileSettingsForm({
  onSave,
  preferredLocale = 'cs',
  profile,
  userId,
}: ProfileSettingsFormProps) {
  const { t } = useTranslation()
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    profile.avatarUrl,
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const form = useForm<ProfileSettingsValues>({
    defaultValues: {
      bio: profile.bio ?? '',
      displayName: profile.displayName ?? '',
      preferredLocale,
      username: profile.username,
    },
    resolver: zodResolver(profileSettingsSchema),
  })

  useEffect(() => {
    return () => {
      if (avatarPreview !== null && avatarPreview !== profile.avatarUrl) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview, profile.avatarUrl])

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null

    if (avatarPreview !== null && avatarPreview !== profile.avatarUrl) {
      URL.revokeObjectURL(avatarPreview)
    }

    setAvatarFile(file)
    setAvatarPreview(
      file === null ? profile.avatarUrl : URL.createObjectURL(file),
    )
    setSaved(false)
  }

  async function handleSubmit(values: ProfileSettingsValues) {
    setSaveError(null)
    setSaved(false)

    try {
      await onSave({
        ...profileSettingsSchema.parse(values),
        avatarFile,
        userId,
      })
      setSaved(true)
    } catch {
      setSaveError(t('profile.settings.saveError'))
    }
  }

  const fieldError = (message: string | undefined) =>
    message === undefined ? undefined : t(message)
  const displayName = useWatch({ control: form.control, name: 'displayName' })
  const username = useWatch({ control: form.control, name: 'username' })
  const avatarLabel = displayName || username

  return (
    <form
      className="space-y-8"
      onChange={() => {
        setSaved(false)
      }}
      onSubmit={(event) => void form.handleSubmit(handleSubmit)(event)}
    >
      <section className="rounded-md bg-surface p-5 shadow-soft sm:p-8">
        <h2 className="text-xl font-semibold">
          {t('profile.settings.photoTitle')}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {t('profile.settings.photoHint')}
        </p>
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar
            className="size-24 text-2xl"
            label={avatarLabel}
            src={avatarPreview}
          />
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 text-sm font-semibold transition-colors hover:bg-sunk">
            <Camera aria-hidden="true" size={18} />
            {t('profile.settings.photoChoose')}
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleAvatarChange}
              type="file"
            />
          </label>
        </div>
      </section>

      <section className="space-y-5 rounded-md bg-surface p-5 shadow-soft sm:p-8">
        <div>
          <h2 className="text-xl font-semibold">
            {t('profile.settings.basicsTitle')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t('profile.settings.basicsHint')}
          </p>
        </div>
        <Input
          autoCapitalize="none"
          autoComplete="username"
          error={fieldError(form.formState.errors.username?.message)}
          label={t('profile.settings.username')}
          {...form.register('username')}
        />
        <Input
          autoComplete="name"
          error={fieldError(form.formState.errors.displayName?.message)}
          label={t('profile.settings.displayName')}
          {...form.register('displayName')}
        />
        <label className="block text-sm font-medium">
          {t('profile.settings.bio')}
          <textarea
            className="mt-2 min-h-32 w-full rounded-md border border-border bg-surface px-3 py-3 text-base font-normal outline-none transition-colors focus:border-primary"
            maxLength={500}
            {...form.register('bio')}
          />
        </label>
        <label className="block text-sm font-medium">
          {t('profile.settings.language')}
          <select
            className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base font-normal outline-none transition-colors focus:border-primary"
            {...form.register('preferredLocale')}
          >
            <option value="cs">Čeština</option>
            <option value="en">English</option>
          </select>
        </label>
      </section>

      <div
        aria-live="polite"
        className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          {saveError === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {saveError}
            </p>
          )}
          {saved ? (
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 aria-hidden="true" size={18} />
              {t('profile.settings.saved')}
            </p>
          ) : null}
        </div>
        <Button
          className="w-full sm:w-auto"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting
            ? t('profile.settings.saving')
            : t('profile.settings.save')}
        </Button>
      </div>
    </form>
  )
}
