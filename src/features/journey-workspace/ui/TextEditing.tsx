import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Moment } from '@/entities/moment/model/moment'
import type { Segment } from '@/entities/segment/model/segment'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { TextEditDialog } from '@/features/journey-workspace/ui/TextEditDialog'

const BUTTON =
  'min-h-10 min-w-10 rounded-md border border-border px-3 py-1.5 text-sm font-semibold'

const CLAMP_LINES = 3
const CLAMP_CHARS = 200

/** Body text with line breaks kept; long text is clamped with a toggle. */
export function ClampedBody({ body }: { body: string }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  if (body === '') return null
  const long =
    body.split('\n').length > CLAMP_LINES || body.length > CLAMP_CHARS
  return (
    <div className="mt-2">
      <p
        className={`whitespace-pre-line break-words text-sm ${expanded || !long ? '' : 'line-clamp-3'}`}
        data-testid="workspace-body"
      >
        {body}
      </p>
      {long ? (
        <button
          aria-expanded={expanded}
          className="min-h-10 text-sm font-semibold underline"
          type="button"
          onClick={() => {
            setExpanded((value) => !value)
          }}
        >
          {expanded ? t('workspace.textShowLess') : t('workspace.textShowMore')}
        </button>
      ) : null}
    </div>
  )
}

export function SegmentTextEditor({
  edits,
  segment,
}: {
  edits: WorkspaceEdits
  segment: Segment
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        aria-label={t('workspace.editTextFor', { name: segment.title })}
        className={BUTTON}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('workspace.editText')}
      </button>
      {open ? (
        <TextEditDialog
          heading={t('workspace.editTextFor', { name: segment.title })}
          initialBody={segment.body}
          initialTitle={segment.title}
          titleRequired
          onClose={() => {
            setOpen(false)
          }}
          onSave={({ body, title }) =>
            title === null
              ? Promise.resolve(false)
              : edits.saveSegmentText(segment, { body, title })
          }
        />
      ) : null}
    </>
  )
}

export function MomentTextEditor({
  edits,
  moment,
  name,
}: {
  edits: WorkspaceEdits
  moment: Moment
  /** Display name (the title or the untitled fallback). */
  name: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        aria-label={t('workspace.editTextFor', { name })}
        className={BUTTON}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('workspace.editText')}
      </button>
      {open ? (
        <TextEditDialog
          heading={t('workspace.editTextFor', { name })}
          initialBody={moment.body}
          initialTitle={moment.title}
          titleRequired={false}
          onClose={() => {
            setOpen(false)
          }}
          onSave={(text) => edits.saveMomentText(moment, text)}
        />
      ) : null}
    </>
  )
}
