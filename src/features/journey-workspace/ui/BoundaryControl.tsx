import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  boundaryCandidates,
  type SegmentPair,
} from '@/features/journey-workspace/model/edit-candidates'
import { BoundaryDialog } from '@/features/journey-workspace/ui/EditDialogs'
import type { EditingContext } from '@/features/journey-workspace/ui/moment-blocks'

const BOUNDARY_BUTTON =
  'inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-muted hover:bg-surface active:bg-surface'

export function BoundaryControl({
  editing,
  locale,
  pair,
}: {
  editing: EditingContext
  locale: string
  pair: SegmentPair
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const before = pair.before.segment
  const after = pair.after.segment
  const close = () => {
    setOpen(false)
  }
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
      <button
        aria-label={`${t('workspace.moveBoundary')}: ${before.title} / ${after.title}`}
        className={BOUNDARY_BUTTON}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('workspace.moveBoundary')}
      </button>
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
      {open ? (
        <BoundaryDialog
          afterTitle={after.title}
          beforeTitle={before.title}
          candidates={boundaryCandidates(
            before,
            after,
            editing.moments,
            editing.unassigned,
          )}
          current={{ at: before.endsAt, tz: before.tz ?? after.tz }}
          locale={locale}
          onClose={close}
          onConfirm={(at) => {
            void editing.edits.moveBoundary(before, after, at).then(close)
          }}
        />
      ) : null}
    </div>
  )
}
