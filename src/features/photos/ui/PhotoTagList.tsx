import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { cn } from '@/shared/lib/cn'

interface PhotoTagListProps {
  className?: string
  onTagClick?: (slug: string) => void
  tags: PhotoTagAssignment[]
}

export function PhotoTagList({
  className,
  onTagClick,
  tags,
}: PhotoTagListProps) {
  if (tags.length === 0) {
    return null
  }

  const uniqueTags = [...new Map(tags.map((tag) => [tag.slug, tag])).values()]

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {uniqueTags.map((tag) =>
        onTagClick === undefined ? (
          <span
            className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
            key={tag.slug}
          >
            {tag.label}
          </span>
        ) : (
          <button
            className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            key={tag.slug}
            onClick={() => {
              onTagClick(tag.slug)
            }}
            type="button"
          >
            {tag.label}
          </button>
        ),
      )}
    </div>
  )
}
