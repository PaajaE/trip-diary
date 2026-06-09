import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { getEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'

interface PhotoGalleryProps {
  alt: string
  entryId: string
}

export function PhotoGallery({ alt, entryId }: PhotoGalleryProps) {
  const previewsQuery = useQuery({
    queryKey: ['entries', entryId, 'photo-previews'],
    queryFn: () => getEntryPhotoPreviews(entryId),
  })
  const urls = useMemo(
    () =>
      previewsQuery.data?.map((preview) => ({
        id: preview.id,
        url: URL.createObjectURL(preview.blob),
      })) ?? [],
    [previewsQuery.data],
  )

  useEffect(
    () => () => {
      for (const preview of urls) {
        URL.revokeObjectURL(preview.url)
      }
    },
    [urls],
  )

  if (urls.length === 0) {
    return null
  }

  return (
    <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {urls.map((preview) => (
        <img
          alt={alt}
          className="aspect-square w-full rounded-md object-cover"
          key={preview.id}
          loading="lazy"
          src={preview.url}
        />
      ))}
    </div>
  )
}
