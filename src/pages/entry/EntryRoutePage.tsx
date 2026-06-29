import { useParams, useSearch } from '@tanstack/react-router'
import { EntryPage } from '@/pages/entry/EntryPage'

export function EntryRoutePage() {
  const { entryId } = useParams({ from: '/e/$entryId' })
  const search = useSearch({ from: '/e/$entryId' })
  return (
    <EntryPage
      entryId={entryId}
      {...(search.notice !== undefined ? { notice: search.notice } : {})}
      {...(search.returnTo !== undefined ? { returnTo: search.returnTo } : {})}
    />
  )
}
