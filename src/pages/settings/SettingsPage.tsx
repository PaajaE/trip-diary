import type { Profile } from '@/entities/profile/model/profile'
import {
  ProfileSettingsForm,
  type PreferredLocale,
  type ProfileSettingsSubmission,
} from '@/features/profile'

interface SettingsPageProps {
  onSave: (submission: ProfileSettingsSubmission) => Promise<void>
  preferredLocale?: PreferredLocale
  profile: Profile
  userId: string
}

export function SettingsPage({
  onSave,
  preferredLocale,
  profile,
  userId,
}: SettingsPageProps) {
  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-medium text-accent">Váš cestovní deník</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Nastavení profilu
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-muted">
          Upravte, jak vás ostatní cestovatelé uvidí.
        </p>
      </header>
      <div className="py-8 sm:py-10">
        <ProfileSettingsForm
          onSave={onSave}
          profile={profile}
          userId={userId}
          {...(preferredLocale === undefined ? {} : { preferredLocale })}
        />
      </div>
    </main>
  )
}
