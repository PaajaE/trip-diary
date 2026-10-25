import { useTranslation } from 'react-i18next'
import type { Profile } from '@/entities/profile/model/profile'
import {
  ProfileSettingsForm,
  type PreferredLocale,
  type ProfileSettingsSubmission,
} from '@/features/profile'
import { AppearanceSection } from '@/features/profile/ui/AppearanceSection'
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
  const { t } = useTranslation()
  return (
    <PageContainer width="form">
      <PageHeader
        description={t('profile.settings.pageDescription')}
        title={t('profile.settings.pageTitle')}
      />
      <Card>
        <ProfileSettingsForm
          onSave={onSave}
          profile={profile}
          userId={userId}
          {...(preferredLocale === undefined ? {} : { preferredLocale })}
        />
      </Card>
      <Card className="mt-6">
        <AppearanceSection />
      </Card>
    </PageContainer>
  )
}
