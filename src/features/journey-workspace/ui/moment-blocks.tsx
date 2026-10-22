import { Hand, Lock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import type { CoverTarget } from '@/features/journey-workspace/model/cover-targets'
import type { SegmentPair } from '@/features/journey-workspace/model/edit-candidates'
import type { HoverStore } from '@/features/journey-workspace/model/workspace-map'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'
import { EditableMediaTile } from '@/features/journey-workspace/ui/EditableMediaTile'
import type { JourneyMomentTags } from '@/features/moment-tags/api/use-moment-tags'

/** Photos shown before the "+N" tile (one grid slot is the "+N" tile). */
const GRID_LIMIT = 6

/** What the editable parts of the workspace need (shared by overview and day). */
export interface EditingContext {
  edits: WorkspaceEdits
  tags: JourneyMomentTags
  /** Every moment of the journey in start order. */
  moments: WorkspaceMoment[]
  /** Place names by place id. */
  placeNames: ReadonlyMap<string, string>
  /** Opens the full-screen viewer at a media item. */
  openViewer: (item: MediaItem, trigger: HTMLElement) => void
  /** Adjacent same-kind segment pairs keyed by the earlier segment id. */
  pairs: Map<string, SegmentPair>
  /** Media outside any moment (candidate instants for boundaries). */
  unassigned: MediaItem[]
  targets: Map<string, CoverTarget[]>
  /** Hovered moment, mirrored as a highlighted map pin. */
  hover: HoverStore
}

export function MediaTiles({
  editing,
  items,
}: {
  editing: EditingContext
  items: MediaItem[]
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const overflow = items.length > GRID_LIMIT
  const visible = overflow && !expanded ? items.slice(0, GRID_LIMIT - 1) : items
  const hidden = items.length - visible.length
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] lg:gap-3">
      {visible.map((item) => (
        <EditableMediaTile
          baseUrl={BASE_URL}
          edits={editing.edits}
          item={item}
          key={item.id}
          onOpen={editing.openViewer}
        />
      ))}
      {overflow && !expanded ? (
        <button
          aria-label={t('workspace.moreMediaLabel', { count: hidden })}
          className="flex aspect-square items-center justify-center rounded-sm bg-surface text-base font-semibold text-muted transition-colors hover:bg-border/60"
          type="button"
          onClick={() => {
            setExpanded(true)
          }}
        >
          +{hidden}
        </button>
      ) : null}
      {overflow && expanded ? (
        <button
          className="col-span-full min-h-11 rounded-xl text-sm font-semibold text-primary hover:bg-surface"
          type="button"
          onClick={() => {
            setExpanded(false)
          }}
        >
          {t('workspace.showFewerMedia')}
        </button>
      ) : null}
    </div>
  )
}

export function StateIcons({
  locked,
  manual,
}: {
  locked: boolean
  manual: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      {manual ? (
        <Hand
          aria-label={t('workspace.manual')}
          className="inline shrink-0 text-muted"
          role="img"
          size={13}
        />
      ) : null}
      {locked ? (
        <Lock
          aria-label={t('workspace.locked')}
          className="inline shrink-0 text-muted"
          role="img"
          size={13}
        />
      ) : null}
    </>
  )
}
