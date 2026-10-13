import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import type { CoverTarget } from '@/features/journey-workspace/model/cover-targets'
import { CAPTION_MAX_LENGTH } from '@/features/journey-workspace/lib/caption'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'

interface EditableMediaTileProps {
  baseUrl: string
  edits: WorkspaceEdits
  item: MediaItem
  /** Levels whose cover this media may become. */
  targets: CoverTarget[]
}

const ICON_BUTTON =
  'absolute flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-lg text-white focus-visible:outline-2 focus-visible:outline-offset-1'

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
        className="min-h-10 w-full rounded-md px-1 text-left text-xs hover:bg-surface"
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
        className="min-h-10 w-full rounded-md border border-border bg-background px-2 text-xs"
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
        <p className="text-xs text-destructive" role="alert">
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
  const [menuOpen, setMenuOpen] = useState(false)
  const level = (target: CoverTarget) =>
    t(`terms.${target.level}.singular`).toLowerCase()
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  const coverOf = targets.filter((target) => target.currentCoverId === item.id)

  return (
    <div
      className="flex w-24 shrink-0 flex-col gap-1"
      data-testid="editable-media-tile"
    >
      <div className="relative">
        <MediaThumb baseUrl={baseUrl} className="h-24 w-24" item={item} />
        <button
          aria-label={t(item.starred ? 'workspace.unstar' : 'workspace.star')}
          aria-pressed={item.starred}
          className={`${ICON_BUTTON} right-0 top-0`}
          type="button"
          onClick={() => {
            void edits.toggleStar(item)
          }}
        >
          <span aria-hidden="true">{item.starred ? '★' : '☆'}</span>
        </button>
        <button
          aria-expanded={menuOpen}
          aria-label={t('workspace.coverMenu')}
          className={`${ICON_BUTTON} left-0 top-0`}
          type="button"
          onClick={() => {
            setMenuOpen((open) => !open)
          }}
        >
          <span aria-hidden="true">{'⋯'}</span>
        </button>
        {menuOpen ? (
          <div
            aria-label={t('workspace.coverMenu')}
            className="absolute left-0 top-10 z-10 flex w-44 flex-col rounded-md border border-border bg-background p-1 shadow-lg"
            role="group"
          >
            {targets.map((target) => {
              const current = target.currentCoverId === item.id
              return (
                <button
                  className="min-h-10 rounded px-2 text-left text-sm hover:bg-surface disabled:text-muted"
                  disabled={current}
                  key={target.level}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
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
        ) : null}
      </div>
      {coverOf.length > 0 ? (
        <span className="rounded bg-primary/10 px-1 text-[11px] font-semibold">
          {t('workspace.coverBadge', {
            levels: coverOf.map(level).join(', '),
          })}
        </span>
      ) : null}
      <CaptionEditor edits={edits} item={item} key={item.id} />
    </div>
  )
}
