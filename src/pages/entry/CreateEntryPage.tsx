import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreateEntryForm } from '@/features/entries/ui/CreateEntryForm'
import { getSupabaseClient } from '@/shared/api/supabase'

export function CreateEntryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [creatorId, setCreatorId] = useState<string | null | undefined>(
    undefined,
  )

  useEffect(() => {
    void getSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        setCreatorId(data.user?.id ?? null)
      })
  }, [])

  return (
    <main className="mx-auto min-h-svh w-full max-w-2xl px-5 py-8 sm:py-16">
      <Link className="text-sm font-semibold" to="/">
        {t('brand')}
      </Link>
      <h1 className="mt-16 text-4xl font-semibold tracking-[-0.04em]">
        {t('entry.createTitle')}
      </h1>
      {creatorId === undefined ? (
        <p className="mt-8 text-muted">{t('entry.loading')}</p>
      ) : creatorId === null ? (
        <p className="mt-8 text-muted">
          {t('entry.signInRequired')}{' '}
          <Link className="font-semibold text-primary" to="/sign-in">
            {t('home.signIn')}
          </Link>
        </p>
      ) : (
        <CreateEntryForm
          creatorId={creatorId}
          onCreated={(entryId) =>
            void navigate({ to: '/e/$entryId', params: { entryId } })
          }
        />
      )}
    </main>
  )
}
