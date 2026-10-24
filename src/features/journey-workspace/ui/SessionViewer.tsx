import { useState } from 'react'
import type { MediaItem } from '@/entities/media/model/media-library'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import { MediaViewer } from '@/features/journey-workspace/ui/MediaViewer'
import type { WorkspaceSession } from '@/features/journey-workspace/ui/workspace-session'
import { FixTimeLocationSheet } from '@/features/media-corrections/ui/FixTimeLocationSheet'

/** Full-screen viewer over the session's media; renders nothing when closed. */
export function SessionViewer({ session }: { session: WorkspaceSession }) {
  const { editing, edits, locale, viewer, viewerGroups } = session
  const [fixing, setFixing] = useState<MediaItem | null>(null)
  if (viewer === null || editing === null) return null
  const fixJourneyId = fixing?.journeyId ?? null
  return (
    <>
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
        {...(session.canEdit
          ? {
              onFixTimeLocation: (item: MediaItem) => {
                setFixing(item)
              },
            }
          : {})}
      />
      {fixing !== null && fixJourneyId !== null ? (
        <FixTimeLocationSheet
          items={[fixing]}
          journeyId={fixJourneyId}
          onClose={() => {
            setFixing(null)
          }}
        />
      ) : null}
    </>
  )
}
