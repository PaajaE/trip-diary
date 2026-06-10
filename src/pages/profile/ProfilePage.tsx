import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getPublicProfile } from '@/entities/profile/api/profile.repository'

interface ProfilePageProps {
  username: string
}

export function ProfilePage({ username }: ProfilePageProps) {
  const { t } = useTranslation()
  const profileQuery = useQuery({
    queryKey: ['profiles', 'public', username],
    queryFn: () => getPublicProfile(username),
  })

  return (
    <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-8 sm:py-16">
      {profileQuery.isPending ? (
        <p className="mt-16 text-muted">{t('profile.loading')}</p>
      ) : profileQuery.isError ? (
        <p className="mt-16 text-destructive" role="alert">
          {t('profile.error')}
        </p>
      ) : profileQuery.data === null ? (
        <p className="mt-16 text-muted">{t('profile.notFound')}</p>
      ) : (
        <section className="mt-16">
          <div className="flex size-20 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
            {(profileQuery.data.displayName ?? profileQuery.data.username)
              .slice(0, 1)
              .toUpperCase()}
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em]">
            {profileQuery.data.displayName ?? profileQuery.data.username}
          </h1>
          <p className="mt-2 text-muted">@{profileQuery.data.username}</p>
          {profileQuery.data.bio === null ? null : (
            <p className="mt-6 max-w-xl leading-7">{profileQuery.data.bio}</p>
          )}
        </section>
      )}
    </main>
  )
}
