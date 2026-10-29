import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type {
  PhotoState,
  SessionPhoto,
} from '@/features/journey-flow/model/sort-session'
import { CompareDuelView } from '@/features/journey-flow/ui/sort/CompareDuelView'
import { SeriesPickView } from '@/features/journey-flow/ui/sort/SeriesPickView'
import type { DaySortState } from '@/features/journey-flow/ui/use-day-sort'
import type { MoveSheetStop } from '@/features/media-batch/model/move-sheet'
import { MoveToSheet } from '@/features/media-batch/ui/MoveToSheet'

export type SortOverlay =
  | { ids: string[]; kind: 'compare'; winnerId: string }
  | { kind: 'move'; item: MediaItem }
  | { kind: 'series'; photos: SessionPhoto[] }

/** The layers above the sorting screen: series, compare and "Přesunout do". */
export function SortOverlays({
  baseUrl,
  moveStops,
  onClose,
  onMove,
  onNewStop,
  overlay,
  sort,
  subtitle,
}: {
  baseUrl: string
  moveStops: readonly MoveSheetStop[]
  onClose: () => void
  onMove: (item: MediaItem, stopId: string) => void
  onNewStop: (item: MediaItem) => void
  overlay: SortOverlay
  sort: DaySortState
  /** Stop and time of the series ("5 · Mistaya Canyon · 12:14–12:15"). */
  subtitle: string
}) {
  const { t } = useTranslation()
  if (overlay.kind === 'move') {
    return (
      <MoveToSheet
        baseUrl={baseUrl}
        items={[overlay.item]}
        stops={moveStops}
        onClose={onClose}
        onNewStop={() => {
          onNewStop(overlay.item)
        }}
        onPick={(stopId) => {
          onMove(overlay.item, stopId)
        }}
      />
    )
  }
  if (overlay.kind === 'series') {
    return (
      <SeriesPickView
        baseUrl={baseUrl}
        canUndo={sort.canUndo}
        photos={overlay.photos}
        starred={sort.starred}
        subtitle={subtitle}
        onClose={onClose}
        onSettle={(keepIds, trashIds) => {
          onClose()
          sort.settleSeries(keepIds, trashIds)
        }}
        onStar={sort.toggleStar}
        onUndo={sort.undo}
      />
    )
  }
  const all = new Map(
    sort.view.stops.flatMap((stop) => stop.photos).map((p) => [p.item.id, p]),
  )
  const photos = overlay.ids.flatMap((id) => {
    const found = all.get(id)
    return found === undefined ? [] : [found]
  })
  const states = new Map<string, PhotoState>(
    photos.map((p) => [p.item.id, p.state]),
  )
  return (
    <CompareDuelView
      backLabel={t('flow.duel.backToSorting')}
      baseUrl={baseUrl}
      canUndo={sort.canUndo}
      photos={photos}
      starred={sort.starred}
      states={states}
      winnerId={overlay.winnerId}
      onClose={onClose}
      onKeep={sort.keep}
      onStar={sort.best}
      onTrash={sort.trash}
      onUndo={sort.undo}
    />
  )
}
