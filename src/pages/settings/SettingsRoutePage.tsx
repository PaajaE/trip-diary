import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  getCurrentProfile,
  updateOwnProfile,
  uploadOwnAvatar,
} from '@/entities/profile/api/profile.repository'
import { processPhoto } from '@/entities/photo/lib/process-photo'
import { useSession } from '@/features/auth/session'
import type { ProfileSettingsSubmission } from '@/features/profile'
import { SettingsPage } from '@/pages/settings/SettingsPage'

export function SettingsRoutePage() {
  const { t } = useTranslation()
  const { loading, refreshProfile, user } = useSession()
  const profileQuery = useQuery({
    enabled: user !== null,
    queryFn: () => getCurrentProfile({ userId: user?.id ?? '' }),
    queryKey: ['profiles', 'current', user?.id],
  })

  if (loading) {
    return <SettingsMessage>{t('profile.settings.loading')}</SettingsMessage>
  }

  if (user === null) {
    return (
      <SettingsMessage>
        {t('profile.settings.signInRequired')}{' '}
        <Link className="font-semibold text-primary" to="/sign-in">
          {t('home.signIn')}
        </Link>
      </SettingsMessage>
    )
  }

  if (profileQuery.isPending) {
    return <SettingsMessage>{t('profile.settings.loading')}</SettingsMessage>
  }

  if (profileQuery.isError || profileQuery.data === null) {
    return <SettingsMessage>{t('profile.settings.error')}</SettingsMessage>
  }

  async function handleSave(submission: ProfileSettingsSubmission) {
    await updateOwnProfile({
      bio: submission.bio === '' ? null : submission.bio,
      displayName:
        submission.displayName === '' ? null : submission.displayName,
      preferredLocale: submission.preferredLocale,
      userId: submission.userId,
      username: submission.username,
    })

    if (submission.avatarFile !== null) {
      const processed = await processPhoto(submission.avatarFile)
      const avatar = processed.variants.find(
        (variant) => variant.kind === 'thumb',
      )?.blob
      if (avatar === undefined) {
        throw new Error('Avatar processing did not produce a thumbnail')
      }
      await uploadOwnAvatar({ avatar, userId: submission.userId })
    }

    await Promise.all([profileQuery.refetch(), refreshProfile()])
  }

  return (
    <SettingsPage
      onSave={handleSave}
      preferredLocale={profileQuery.data.preferredLocale}
      profile={profileQuery.data}
      userId={user.id}
    />
  )
}

function SettingsMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] max-w-3xl px-5 py-16 text-muted sm:px-8">
      {children}
    </main>
  )
}
