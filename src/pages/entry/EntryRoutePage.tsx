import { useParams } from '@tanstack/react-router'
import { EntryPage } from '@/pages/entry/EntryPage'

export function EntryRoutePage() {
  const { entryId } = useParams({ from: '/e/$entryId' })
  return <EntryPage entryId={entryId} />
}
