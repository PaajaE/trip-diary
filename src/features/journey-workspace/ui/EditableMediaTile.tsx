import { Ellipsis, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import type { CoverTarget } from '@/features/journey-workspace/model/cover-targets'
import { CAPTION_MAX_LENGTH } from '@/features/journey-workspace/lib/caption'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'

interface EditableMediaTileProps {
  baseUrl: string
  edits: WorkspaceEdits
  item: MediaItem
  /** Levels whose cover this media may become. */
  targets: CoverTarget[]
}

function CaptionEditor({
  edits,
  item,
}: {
  edits: WorkspaceEdits
  item: MediaItem
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [tooLong, setTooLong] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const saving = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = async () => {
    if (saving.current) return
    saving.current = true
    const result = await edits.saveCaption(item, draft).finally(() => {
      saving.current = false
    })
    if (result.ok) {
      setEditing(false)
      setTooLong(false)
    } else {
      setTooLong(true)
    }
  }

  if (!editing) {
    return (
      <button
        className="min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-surface"
        type="button"
        onClick={() => {
          cancelled.current = false
          setDraft(item.caption ?? '')
          setTooLong(false)
          setEditing(true)
        }}
      >
        {item.caption !== null ? (
          <span className="line-clamp-2 break-words">{item.caption}</span>
        ) : (
          <span className="text-muted">{t('workspace.addCaption')}</span>
        )}
        <span className="sr-only"> ({t('workspace.caption')})</span>
      </button>
    )
  }
  return (
    <div className="w-full">
      <input
        aria-invalid={tooLong}
        aria-label={t('workspace.caption')}
        className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        ref={inputRef}
        type="text"
        value={draft}
        onBlur={() => {
          if (cancelled.current) return
          void commit()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          setTooLong(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit()
          } else if (event.key === 'Escape') {
            cancelled.current = true
            setEditing(false)
            setTooLong(false)
          }
        }}
      />
      {tooLong ? (
        <p className="px-3 text-xs text-destructive" role="alert">
          {t('workspace.captionTooLong', { max: CAPTION_MAX_LENGTH })}
        </p>
      ) : null}
    </div>
  )
}

export function EditableMediaTile({
  baseUrl,
  edits,
  item,
  targets,
}: EditableMediaTileProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const level = (target: CoverTarget) =>
    t(`terms.${target.level}.singular`).toLowerCase()
  const coverOf = targets.filter((target) => target.currentCoverId === item.id)
  const close = () => {
    setOpen(false)
  }

  return (
    <div className="group relative" data-testid="editable-media-tile">
      <button
        aria-label={t('workspace.mediaActions')}
        className="relative block aspect-square w-full overflow-hidden rounded-sm bg-surface transition-shadow hover:shadow-soft hover:ring-2 hover:ring-primary/40"
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        <MediaThumb baseUrl={baseUrl} className="h-full w-full" item={item} />
        {item.starred ? (
          <Star
            aria-hidden="true"
            className="absolute right-1 top-1 fill-amber-300 text-amber-300 drop-shadow lg:hidden"
            data-testid="starred-indicator"
            size={16}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 hidden size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 lg:flex"
        >
          <Ellipsis size={16} />
        </span>
        {item.caption !== null ? (
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[11px] text-white">
            {item.caption}
          </span>
        ) : null}
      </button>
      <button
        aria-label={t(
          item.starred ? 'workspace.unstarPhoto' : 'workspace.starPhoto',
        )}
        aria-pressed={item.starred}
        className={cn(
          'absolute right-1 top-1 hidden size-8 items-center justify-center rounded-full bg-black/55 text-white transition-opacity focus-visible:opacity-100 group-hover:opacity-100 lg:flex',
          item.starred ? 'opacity-100' : 'opacity-0',
        )}
        data-testid="quick-star"
        type="button"
        onClick={() => {
          void edits.toggleStar(item)
        }}
      >
        <Star
          aria-hidden="true"
          className={item.starred ? 'fill-amber-300 text-amber-300' : ''}
          size={16}
        />
      </button>
      {open ? (
        <WorkspaceDialog title={t('workspace.mediaSheetTitle')} onClose={close}>
          <div className="mt-3 space-y-3">
            <button
              aria-pressed={item.starred}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-medium hover:bg-surface"
              type="button"
              onClick={() => {
                close()
                void edits.toggleStar(item)
              }}
            >
              <span aria-hidden="true">{item.starred ? '★' : '☆'}</span>
              {t(item.starred ? 'workspace.unstar' : 'workspace.star')}
            </button>
            <CaptionEditor edits={edits} item={item} key={item.id} />
            {coverOf.length > 0 ? (
              <p className="px-3 text-sm font-semibold text-primary">
                {t('workspace.coverBadge', {
                  levels: coverOf.map(level).join(', '),
                })}
              </p>
            ) : null}
            <div
              aria-label={t('workspace.coverMenu')}
              className="flex flex-col"
              role="group"
            >
              {targets.map((target) => {
                const current = target.currentCoverId === item.id
                return (
                  <button
                    className="min-h-12 rounded-xl px-3 text-left hover:bg-surface disabled:text-muted"
                    disabled={current}
                    key={target.level}
                    type="button"
                    onClick={() => {
                      close()
                      void edits.setCover(item.id, target)
                    }}
                  >
                    {current
                      ? t('workspace.coverCurrent', { level: level(target) })
                      : t('workspace.useAsCover', { level: level(target) })}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button className={dialogButton} type="button" onClick={close}>
              {t('common.close')}
            </button>
          </div>
        </WorkspaceDialog>
      ) : null}
    </div>
  )
}
