import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import { MediaViewer } from '@/features/journey-workspace/ui/MediaViewer'
import type { WorkspaceSession } from '@/features/journey-workspace/ui/workspace-session'

/** Full-screen viewer over the session's media; renders nothing when closed. */
export function SessionViewer({ session }: { session: WorkspaceSession }) {
  const { editing, edits, locale, viewer, viewerGroups } = session
  if (viewer === null || editing === null) return null
  return (
    <MediaViewer
      baseUrl={BASE_URL}
      edits={edits}
      groups={viewerGroups}
      locale={locale}
      returnFocusTo={viewer.opener}
      startId={viewer.startId}
      targets={editing.targets}
      onClose={session.closeViewer}
      onDelete={(item) => {
        void edits.trashMedia([item])
      }}
    />
  )
}
