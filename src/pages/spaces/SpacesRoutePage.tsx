import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  createFamilySpace,
  listMySpaces,
} from '@/entities/space/api/space.repository'
import {
  getActiveSpaceId,
  setActiveSpaceId,
} from '@/entities/space/model/active-space'
import { useSession } from '@/features/auth/session'
import { SpacesPage } from '@/pages/spaces/SpacesPage'

export function SpacesRoutePage() {
  const { loading, user } = useSession()
  const [activeId, setActiveId] = useState('')
  const [creatingFamily, setCreatingFamily] = useState(false)
  const query = useQuery({
    enabled: user !== null,
    queryFn: () => listMySpaces(user?.id ?? ''),
    queryKey: ['spaces', user?.id],
  })

  if (loading) return <Message>Načítám vaše prostory…</Message>
  if (user === null) {
    return (
      <Message>
        Pro správu rodinných prostorů se prosím{' '}
        <Link className="font-semibold text-primary" to="/sign-in">
          přihlaste
        </Link>
        .
      </Message>
    )
  }
  if (query.isPending) return <Message>Načítám vaše prostory…</Message>
  if (query.isError) return <Message>Prostory se nepodařilo načíst.</Message>

  const availableIds = query.data.map(({ id }) => id)
  const resolvedActiveId = availableIds.includes(activeId)
    ? activeId
    : getActiveSpaceId(availableIds)
  const activeSpace = query.data.find(({ id }) => id === resolvedActiveId)
  return (
    <>
      <SpacesPage
        activeSpaceId={resolvedActiveId}
        creatingFamily={creatingFamily}
        onCancelCreate={() => {
          setCreatingFamily(false)
        }}
        onCreateFamily={async (values) => {
          const id = await createFamilySpace(values)
          setActiveSpaceId(id)
          setActiveId(id)
          setCreatingFamily(false)
          await query.refetch()
        }}
        onOpenCreate={() => {
          setCreatingFamily(true)
        }}
        onSelectSpace={(id) => {
          setActiveSpaceId(id)
          setActiveId(id)
        }}
        spaces={query.data.map((space) => ({
          avatarUrl: space.avatarUrl,
          handle: space.handle,
          id: space.id,
          kind: space.kind,
          name: space.name,
        }))}
      />
      {activeSpace?.kind === 'family' ? (
        <div className="mx-auto -mt-14 max-w-3xl px-5 pb-16 sm:px-8">
          <Link
            className="font-semibold text-primary"
            params={{ spaceId: activeSpace.id }}
            to="/spaces/$spaceId/members"
          >
            Spravovat členy prostoru {activeSpace.name}
          </Link>
        </div>
      ) : null}
    </>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-muted sm:px-8">
      {children}
    </main>
  )
}
