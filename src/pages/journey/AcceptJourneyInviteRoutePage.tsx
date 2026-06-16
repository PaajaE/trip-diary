import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import {
  acceptJourneyInvite,
  getJourneyInvitePreview,
} from '@/entities/journey/api/journey-member.repository'
import { useSession } from '@/features/auth/session'
import { storeAuthReturnPath } from '@/features/auth/session/auth-return'
import {
  AcceptJourneyInvitePage,
  type AcceptJourneyInviteState,
} from '@/pages/journey/AcceptJourneyInvitePage'

export function AcceptJourneyInviteRoutePage() {
  const { token } = useParams({ from: '/journey-invite/$token' })
  const { user } = useSession()
  const navigate = useNavigate()
  const [accepting, setAccepting] = useState(false)
  const [acceptedJourneyId, setAcceptedJourneyId] = useState<string | null>(
    null,
  )
  const [acceptError, setAcceptError] = useState(false)
  const previewQuery = useQuery({
    queryFn: () => getJourneyInvitePreview(token),
    queryKey: ['journey-invite-preview', token],
  })

  const preview = previewQuery.data
  let state: AcceptJourneyInviteState
  if (previewQuery.isPending) {
    state = { status: 'loading' }
  } else if (previewQuery.isError) {
    state = { status: 'error' }
  } else if (preview === null || preview === undefined) {
    state = { status: 'invalid' }
  } else if (acceptError) {
    state = { journey: preview, status: 'error' }
  } else if (acceptedJourneyId !== null) {
    state = { journey: preview, status: 'accepted' }
  } else if (accepting) {
    state = { journey: preview, status: 'accepting' }
  } else {
    state = { journey: preview, status: 'ready' }
  }

  return (
    <AcceptJourneyInvitePage
      onAccept={async () => {
        setAccepting(true)
        try {
          setAcceptedJourneyId(await acceptJourneyInvite(token))
        } catch {
          setAcceptError(true)
        } finally {
          setAccepting(false)
        }
      }}
      onContinue={() => {
        if (acceptedJourneyId === null) {
          void navigate({ to: '/dashboard' })
          return
        }
        void navigate({
          params: { journeyId: acceptedJourneyId },
          to: '/j/$journeyId',
        })
      }}
      onSignIn={() => {
        storeAuthReturnPath(window.location.pathname)
        void navigate({ to: '/sign-in' })
      }}
      signedIn={user !== null}
      state={state}
    />
  )
}
