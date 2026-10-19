import { Maximize2, Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'

interface EditableMediaTileProps {
  baseUrl: string
  edits: WorkspaceEdits
  item: MediaItem
  /** Opens the full-screen viewer at this item; `trigger` gets focus back. */
  onOpen: (item: MediaItem, trigger: HTMLElement) => void
}

export function EditableMediaTile({
  baseUrl,
  edits,
  item,
  onOpen,
}: EditableMediaTileProps) {
  const { t } = useTranslation()

  return (
    <div className="group relative" data-testid="editable-media-tile">
      <button
        aria-label={t('viewer.open')}
        className="relative block aspect-square w-full overflow-hidden rounded-sm bg-surface transition-shadow hover:shadow-soft hover:ring-2 hover:ring-primary/40"
        type="button"
        onClick={(event) => {
          onOpen(item, event.currentTarget)
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
          <Maximize2 size={16} />
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
      <button
        aria-label={t('trash.moveToTrash')}
        className="absolute right-10 top-1 hidden size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 lg:flex"
        data-testid="quick-trash"
        type="button"
        onClick={() => {
          void edits.trashMedia([item])
        }}
      >
        <Trash2 aria-hidden="true" size={16} />
      </button>
    </div>
  )
}
