import type { MediaItem } from '@/entities/media/model/media-library'
import type { FlowDay, FlowStop } from '@/features/journey-flow/model/flow-days'
import { PhotoPickSheet } from '@/features/journey-flow/ui/PhotoPickSheet'
import { RenameDialog } from '@/features/journey-flow/ui/RenameDialog'
import type {
  ReviewActions,
  ReviewOverlay,
} from '@/features/journey-flow/ui/ReviewScreen'
import { UnassignedSheet } from '@/features/journey-flow/ui/UnassignedSheet'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import type { MoveSheetStop } from '@/features/media-batch/model/move-sheet'
import { MoveToSheet } from '@/features/media-batch/ui/MoveToSheet'

/** The sheets and dialogs of Kontrola zastávek (split, move, rename, Nezařazené). */
export function ReviewOverlays({
  actions,
  day,
  journeyId,
  lookup,
  moveStops,
  overlay,
  run,
  setOverlay,
  stop,
}: {
  actions: ReviewActions
  day: FlowDay
  journeyId: string
  lookup: ReadonlyMap<string, MediaItem>
  moveStops: readonly MoveSheetStop[]
  overlay: ReviewOverlay
  run: (action: () => Promise<unknown>) => Promise<boolean>
  setOverlay: (overlay: ReviewOverlay | null) => void
  /** The stop the overlay is about (split, move, rename). */
  stop: FlowStop | undefined
}) {
  return (
    <>
      {overlay.kind === 'split' && stop !== undefined ? (
        <PhotoPickSheet
          mode="cut"
          stop={stop}
          onClose={() => {
            setOverlay(null)
          }}
          onConfirm={(at) => {
            setOverlay(null)
            run(() => actions.splitStop(stop.id, at)).catch(() => undefined)
          }}
        />
      ) : null}
      {overlay.kind === 'move' && stop !== undefined ? (
        <PhotoPickSheet
          mode="select"
          stop={stop}
          onClose={() => {
            setOverlay(null)
          }}
          onConfirm={(ids) => {
            setOverlay({
              items: stop.media.filter((item) => ids.includes(item.id)),
              kind: 'moveTo',
            })
          }}
        />
      ) : null}
      {overlay.kind === 'moveTo' ? (
        <MoveToSheet
          baseUrl={BASE_URL}
          items={overlay.items}
          stops={moveStops}
          onClose={() => {
            setOverlay(null)
          }}
          onNewStop={() => {
            // A stop of its own from exactly these photos (locked).
            const ids = overlay.items.map((item) => item.id)
            setOverlay(null)
            run(() => actions.createStopFromPhotos(ids)).catch(() => undefined)
          }}
          onPick={(stopId) => {
            const ids = overlay.items.map((item) => item.id)
            setOverlay(null)
            run(() => actions.movePhotos(ids, stopId)).catch(() => undefined)
          }}
        />
      ) : null}
      {overlay.kind === 'rename' && stop !== undefined ? (
        <RenameDialog
          initial={stop.entry.moment.title ?? ''}
          onClose={() => {
            setOverlay(null)
          }}
          onSave={(title) => {
            setOverlay(null)
            run(() => actions.renameStop(stop.id, title)).catch(() => undefined)
          }}
        />
      ) : null}
      {overlay.kind === 'unassigned' ? (
        <UnassignedSheet
          actions={actions}
          day={day}
          journeyId={journeyId}
          lookup={lookup}
          run={run}
          onClose={() => {
            setOverlay(null)
          }}
          onElsewhere={(items) => {
            setOverlay({ items, kind: 'moveTo' })
          }}
        />
      ) : null}
    </>
  )
}
