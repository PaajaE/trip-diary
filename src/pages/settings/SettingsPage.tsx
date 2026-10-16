import type { Profile } from '@/entities/profile/model/profile'
import {
  ProfileSettingsForm,
  type PreferredLocale,
  type ProfileSettingsSubmission,
} from '@/features/profile'
import { Card, PageContainer, PageHeader } from '@/shared/ui/PageLayout'

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
    <PageContainer>
      <PageHeader
        description="Upravte, jak vás ostatní cestovatelé uvidí."
        title="Nastavení profilu"
      />
      <Card>
        <ProfileSettingsForm
          onSave={onSave}
          profile={profile}
          userId={userId}
          {...(preferredLocale === undefined ? {} : { preferredLocale })}
        />
      </Card>
    </PageContainer>
  )
}
