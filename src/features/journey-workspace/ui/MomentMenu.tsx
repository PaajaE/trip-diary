import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  countsText,
  momentTitle,
} from '@/features/journey-workspace/lib/moment-labels'
import {
  findAdjacentMoments,
  splitCandidates,
} from '@/features/journey-workspace/model/edit-candidates'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'
import {
  DeleteMomentDialog,
  MergeDialog,
  SplitDialog,
} from '@/features/journey-workspace/ui/EditDialogs'
import type { EditingContext } from '@/features/journey-workspace/ui/moment-blocks'
import {
  OverflowMenu,
  type MenuAction,
} from '@/features/journey-workspace/ui/OverflowMenu'
import { MomentTagsDialog } from '@/features/moment-tags/ui/MomentTags'

type Dialog = 'delete' | 'next' | 'previous' | 'split' | 'tags'

/**
 * The "..." menu of one stop (moment): tags, merge with the previous or next
 * stop, split and delete, each with its confirmation dialog.
 */
export function MomentMenu({
  className = '',
  editing,
  entry,
  locale,
}: {
  className?: string
  editing: EditingContext
  entry: WorkspaceMoment
  locale: string
}) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const neighbours = findAdjacentMoments(editing.moments, entry.moment.id)
  const other =
    dialog === 'next'
      ? neighbours.next
      : dialog === 'previous'
        ? neighbours.previous
        : null
  const close = () => {
    setDialog(null)
  }
  const name = momentTitle(entry, t, locale, editing.placeNames)
  const item = (key: Dialog, label: string): MenuAction => ({
    key,
    label,
    onSelect: () => {
      setDialog(key)
    },
  })
  const actions: MenuAction[] = [
    item('tags', t('tags.edit')),
    ...(neighbours.previous === null
      ? []
      : [item('previous', t('workspace.mergeWithPrevious'))]),
    ...(neighbours.next === null
      ? []
      : [item('next', t('workspace.mergeWithNext'))]),
    item('split', t('workspace.splitMoment')),
    item('delete', t('workspace.deleteMoment')),
  ]
  const counts = countsText(t, {
    photos: entry.photoCount,
    videos: entry.videoCount,
  })
  return (
    <>
      <OverflowMenu actions={actions} className={className} name={name} />
      {dialog === 'tags' ? (
        <MomentTagsDialog
          momentId={entry.moment.id}
          momentName={name}
          tags={editing.tags}
          onClose={close}
        />
      ) : null}
      {other !== null ? (
        <MergeDialog
          sourceLabel={momentTitle(other, t, locale, editing.placeNames)}
          targetLabel={name}
          onClose={close}
          onConfirm={() => {
            void editing.edits
              .mergeMoments(entry.moment.id, other.moment.id)
              .then(close)
          }}
        />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteMomentDialog
          counts={counts}
          mediaCount={entry.media.length}
          name={name}
          onClose={close}
          onConfirm={(mode) => editing.edits.deleteMoment(entry.moment, mode)}
        />
      ) : null}
      {dialog === 'split' ? (
        <SplitDialog
          candidates={splitCandidates(entry)}
          locale={locale}
          tz={entry.tz}
          onClose={close}
          onConfirm={(at) => {
            void editing.edits.splitMoment(entry.moment.id, at).then(close)
          }}
        />
      ) : null}
    </>
  )
}
