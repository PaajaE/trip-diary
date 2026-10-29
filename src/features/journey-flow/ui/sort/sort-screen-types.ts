import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import type { DaySortActions } from '@/features/journey-flow/ui/use-day-sort'

/** Everything the sorting screen writes (sorting and structural edits). */
export type SortScreenActions = DaySortActions &
  Pick<
    FlowActions,
    | 'createStopFromPhotos'
    | 'daySits'
    | 'mergeWithPrevious'
    | 'movePhotos'
    | 'splitStop'
  >
