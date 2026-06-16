import { CheckCircle2, Link2Off, LoaderCircle, MapPinned } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button'

export type AcceptJourneyInviteState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { journey?: JourneyInvitePreview; message?: string; status: 'error' }
  | { journey: JourneyInvitePreview; status: 'ready' }
  | { journey: JourneyInvitePreview; status: 'accepting' }
  | { journey: JourneyInvitePreview; status: 'accepted' }

export interface JourneyInvitePreview {
  id: string
  summary: string
  title: string
}

interface AcceptJourneyInvitePageProps {
  onAccept: () => Promise<void> | void
  onContinue: () => void
  onSignIn: () => void
  signedIn: boolean
  state: AcceptJourneyInviteState
}

export function AcceptJourneyInvitePage({
  onAccept,
  onContinue,
  onSignIn,
  signedIn,
  state,
}: AcceptJourneyInvitePageProps) {
  const { t } = useTranslation()

  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl items-center px-5 py-10 sm:px-8">
      <section className="w-full rounded-md bg-surface p-6 text-center shadow-soft sm:p-10">
        {state.status === 'loading' ? (
          <InviteMessage
            description={t('journey.invite.loadingDescription')}
            icon={LoaderCircle}
            title={t('journey.invite.loadingTitle')}
          />
        ) : state.status === 'invalid' ? (
          <InviteMessage
            description={t('journey.invite.invalidDescription')}
            icon={Link2Off}
            title={t('journey.invite.invalidTitle')}
          />
        ) : state.status === 'error' ? (
          <InviteMessage
            description={state.message ?? t('journey.invite.errorDescription')}
            icon={Link2Off}
            title={t('journey.invite.errorTitle')}
          />
        ) : (
          <>
            <MapPinned
              aria-hidden="true"
              className="mx-auto text-accent"
              size={34}
            />
            {state.status === 'accepted' ? (
              <CheckCircle2
                aria-hidden="true"
                className="mx-auto mt-6 text-primary"
                size={30}
              />
            ) : null}
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
              {state.status === 'accepted'
                ? t('journey.invite.acceptedTitle', {
                    title: state.journey.title,
                  })
                : t('journey.invite.readyTitle', {
                    title: state.journey.title,
                  })}
            </h1>
            <p className="mt-3 leading-7 text-muted">
              {state.journey.summary === ''
                ? t('journey.invite.readyFallback')
                : state.journey.summary}
            </p>
            <div className="mt-8">
              {state.status === 'accepted' ? (
                <Button className="w-full" onClick={onContinue}>
                  {t('journey.invite.continue')}
                </Button>
              ) : signedIn ? (
                <Button
                  className="w-full"
                  disabled={state.status === 'accepting'}
                  onClick={() => void onAccept()}
                >
                  {state.status === 'accepting'
                    ? t('journey.invite.accepting')
                    : t('journey.invite.accept')}
                </Button>
              ) : (
                <Button className="w-full" onClick={onSignIn}>
                  {t('journey.invite.signIn')}
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

interface InviteMessageProps {
  description: string
  icon: typeof LoaderCircle
  title: string
}

function InviteMessage({ description, icon: Icon, title }: InviteMessageProps) {
  return (
    <>
      <Icon aria-hidden="true" className="mx-auto text-muted" size={34} />
      <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">
        {title}
      </h1>
      <p className="mt-4 leading-7 text-muted">{description}</p>
    </>
  )
}
