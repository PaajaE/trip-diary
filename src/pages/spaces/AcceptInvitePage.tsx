import { CheckCircle2, Link2Off, LoaderCircle, UsersRound } from 'lucide-react'
import type { AcceptInviteState } from '@/features/spaces'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'

interface AcceptInvitePageProps {
  onAccept: () => Promise<void> | void
  onContinue: () => void
  onSignIn: () => void
  signedIn: boolean
  state: AcceptInviteState
}

export function AcceptInvitePage({
  onAccept,
  onContinue,
  onSignIn,
  signedIn,
  state,
}: AcceptInvitePageProps) {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl items-center px-5 py-10 sm:px-8">
      <section className="w-full rounded-md bg-surface p-6 text-center shadow-soft sm:p-10">
        {state.status === 'loading' ? (
          <InviteMessage
            description="Ověřujeme pozvánku a připravujeme společný prostor."
            icon={LoaderCircle}
            title="Načítám pozvánku…"
          />
        ) : state.status === 'invalid' ? (
          <InviteMessage
            description="Odkaz mohl vypršet, být odvolán nebo už byl použit."
            icon={Link2Off}
            title="Pozvánka není platná"
          />
        ) : state.status === 'error' ? (
          <InviteMessage
            description={
              state.message ??
              'Pozvánku se nepodařilo načíst. Zkuste to prosím znovu.'
            }
            icon={Link2Off}
            title="Něco se nepovedlo"
          />
        ) : (
          <>
            <Avatar
              className="mx-auto size-20 text-2xl"
              label={state.space.name}
              src={state.space.avatarUrl}
            />
            {state.status === 'accepted' ? (
              <CheckCircle2
                aria-hidden="true"
                className="mx-auto mt-6 text-primary"
                size={30}
              />
            ) : (
              <UsersRound
                aria-hidden="true"
                className="mx-auto mt-6 text-accent"
                size={30}
              />
            )}
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
              {state.status === 'accepted'
                ? `Jste součástí ${state.space.name}`
                : `${state.space.name} vás zve`}
            </h1>
            <p className="mt-3 leading-7 text-muted">@{state.space.handle}</p>
            <div className="mt-8">
              {state.status === 'accepted' ? (
                <Button className="w-full" onClick={onContinue}>
                  Pokračovat do prostoru
                </Button>
              ) : signedIn ? (
                <Button
                  className="w-full"
                  disabled={state.status === 'accepting'}
                  onClick={() => void onAccept()}
                >
                  {state.status === 'accepting'
                    ? 'Přijímám pozvánku…'
                    : 'Přijmout pozvánku'}
                </Button>
              ) : (
                <Button className="w-full" onClick={onSignIn}>
                  Přihlásit se a přijmout
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
