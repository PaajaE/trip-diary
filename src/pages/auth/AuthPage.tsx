import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AuthForm } from '@/features/auth/ui/AuthForm'
import { consumeAuthReturnPath } from '@/features/auth/session/auth-return'

interface AuthPageProps {
  mode: 'signIn' | 'signUp'
}

export function AuthPage({ mode }: AuthPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const otherMode = mode === 'signIn' ? 'signUp' : 'signIn'

  return (
    <main className="mx-auto min-h-svh w-full max-w-md px-5 py-8 sm:py-16">
      <section className="mt-16 rounded-2xl bg-surface p-6 sm:p-8">
        <h1 className="reader-display text-3xl tracking-[-0.03em]">
          {t(`auth.${mode}.title`)}
        </h1>
        <p className="mt-3 leading-7 text-muted">
          {t(`auth.${mode}.description`)}
        </p>
        <AuthForm
          mode={mode}
          onSuccess={() => {
            const returnPath = consumeAuthReturnPath()
            if (returnPath === null) {
              void navigate({ to: '/dashboard' })
            } else {
              window.location.assign(returnPath)
            }
          }}
        />
        <p className="mt-6 text-center text-sm text-muted">
          {t(`auth.${mode}.alternative`)}{' '}
          <Link
            className="font-semibold text-primary underline-offset-4 hover:underline"
            to={otherMode === 'signIn' ? '/sign-in' : '/sign-up'}
          >
            {t(`auth.${otherMode}.action`)}
          </Link>
        </p>
      </section>
    </main>
  )
}
