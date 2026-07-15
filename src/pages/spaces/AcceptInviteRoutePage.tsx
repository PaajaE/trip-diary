import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import {
  acceptSpaceInvite,
  getSpaceInvitePreview,
} from '@/entities/space/api/space.repository'
import { spaceQueryKeys } from '@/entities/space/api/space-query-keys'
import { setActiveSpaceId } from '@/entities/space/model/active-space'
import { useSession } from '@/features/auth/session'
import { storeAuthReturnPath } from '@/features/auth/session/auth-return'
import type { AcceptInviteState } from '@/features/spaces'
import { AcceptInvitePage } from '@/pages/spaces/AcceptInvitePage'

export function AcceptInviteRoutePage() {
  const { token } = useParams({ from: '/invite/$token' })
  const { user } = useSession()
  const navigate = useNavigate()
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [acceptError, setAcceptError] = useState(false)
  const previewQuery = useQuery({
    queryFn: () => getSpaceInvitePreview(token),
    queryKey: spaceQueryKeys.invitePreview(token),
  })

  const preview = previewQuery.data
  let state: AcceptInviteState
  if (previewQuery.isPending) state = { status: 'loading' }
  else if (previewQuery.isError) state = { status: 'error' }
  else if (preview == null) state = { status: 'invalid' }
  else if (acceptError) state = { space: preview, status: 'error' }
  else if (accepted) state = { space: preview, status: 'accepted' }
  else if (accepting) state = { space: preview, status: 'accepting' }
  else state = { space: preview, status: 'ready' }

  return (
    <AcceptInvitePage
      onAccept={async () => {
        setAccepting(true)
        try {
          setActiveSpaceId(await acceptSpaceInvite({ token }))
          setAccepted(true)
        } catch {
          setAcceptError(true)
        } finally {
          setAccepting(false)
        }
      }}
      onContinue={() => void navigate({ to: '/spaces' })}
      onSignIn={() => {
        storeAuthReturnPath(window.location.pathname)
        void navigate({ to: '/sign-in' })
      }}
      signedIn={user !== null}
      state={state}
    />
  )
}
