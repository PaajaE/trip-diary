import { useQuery } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { getEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { cn } from '@/shared/lib/cn'

interface PublicEntryCardThumbnailProps {
  entryId: string
  imageUrl?: string | null
}

export function PublicEntryCardThumbnail({
  entryId,
  imageUrl,
}: PublicEntryCardThumbnailProps) {
  const hasRemoteImage =
    imageUrl !== undefined && imageUrl !== null && imageUrl !== ''
  const previewsQuery = useQuery({
    enabled: !hasRemoteImage,
    queryFn: () => getEntryPhotoPreviews(entryId),
    queryKey: ['entries', entryId, 'public-card-thumb'],
  })
  const resolvedUrls = usePhotoObjectUrls(previewsQuery.data ?? [])
  const src = hasRemoteImage ? imageUrl : resolvedUrls[0]?.url

  if (src !== undefined && src !== '') {
    return (
      <img
        alt=""
        className="size-20 shrink-0 rounded-sm object-cover sm:size-24"
        loading="lazy"
        src={src}
      />
    )
  }

  if (!hasRemoteImage && previewsQuery.isPending) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'size-20 shrink-0 rounded-sm bg-primary/5 sm:size-24',
          'animate-pulse',
        )}
      />
    )
  }

  return (
    <span className="flex size-20 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary sm:size-24">
      <BookOpen aria-hidden="true" size={24} />
    </span>
  )
}
