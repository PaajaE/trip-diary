import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@/entities/tag/model/tag'
import type { JourneyMomentTags } from '@/features/moment-tags/api/use-moment-tags'
import { tagDisplayLabel } from '@/features/moment-tags/lib/tag-label'
import { TagPickerDialog } from '@/features/moment-tags/ui/TagPickerDialog'

const BUTTON =
  'min-h-10 min-w-10 rounded-md border border-border px-3 py-1.5 text-sm font-semibold'

export const TAG_CHIP =
  'inline-flex min-h-6 items-center rounded-full border border-border px-2.5 py-0.5 text-xs'

/** Read-only chips of a moment's tags. */
export function TagChips({ tags }: { tags: Tag[] }) {
  const { t } = useTranslation()
  if (tags.length === 0) return null
  return (
    <ul
      aria-label={t('tags.listLabel')}
      className="mt-2 flex flex-wrap gap-1.5"
      data-testid="moment-tags"
    >
      {tags.map((tag) => (
        <li
          className={`${TAG_CHIP} ${tag.kind === 'category' ? 'bg-surface font-medium' : ''}`}
          key={tag.id}
        >
          {tagDisplayLabel(tag, t)}
        </li>
      ))}
    </ul>
  )
}

/** The tag picker dialog for one moment (opened from a button or a menu). */
export function MomentTagsDialog({
  momentId,
  momentName,
  onClose,
  tags,
}: {
  momentId: string
  momentName: string
  onClose: () => void
  tags: JourneyMomentTags
}) {
  const { t } = useTranslation()
  return (
    <TagPickerDialog
      attached={tags.byMoment.get(momentId) ?? []}
      catalog={tags.catalog}
      heading={t('tags.editFor', { name: momentName })}
      onAddFree={(label) => tags.edits.addFree(momentId, label)}
      onAddSpecies={(species) => tags.edits.addSpecies(momentId, species)}
      onClose={onClose}
      onToggle={(tag, attached) => tags.edits.toggle(momentId, tag, attached)}
    />
  )
}

/** The "Tags" button that opens the picker for one moment. */
export function MomentTagsEditor({
  momentId,
  momentName,
  tags,
}: {
  momentId: string
  momentName: string
  tags: JourneyMomentTags
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        aria-label={t('tags.editFor', { name: momentName })}
        className={BUTTON}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('tags.edit')}
      </button>
      {open ? (
        <MomentTagsDialog
          momentId={momentId}
          momentName={momentName}
          tags={tags}
          onClose={() => {
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
