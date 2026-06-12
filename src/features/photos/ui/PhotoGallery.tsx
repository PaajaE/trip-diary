import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'

interface PhotoGalleryProps {
  alt: string
  entryId: string
  showEmpty?: boolean
}

function GalleryImage({ alt, src }: { alt: string; src: string }) {
  const [isBroken, setIsBroken] = useState(false)

  if (isBroken) {
    return null
  }

  return (
    <img
      alt={alt}
      className="aspect-square w-full rounded-md object-cover"
      loading="lazy"
      onError={() => {
        setIsBroken(true)
      }}
      src={src}
    />
  )
}

export function PhotoGallery({
  alt,
  entryId,
  showEmpty = true,
}: PhotoGalleryProps) {
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

  if (previewsQuery.isPending) {
    return (
      <p className="mt-8 text-sm text-muted" role="status">
        Načítám fotografie…
      </p>
    )
  }

  if (previewsQuery.isError) {
    return (
      <p className="mt-8 text-sm text-destructive" role="alert">
        Fotografie se nepodařilo načíst.
      </p>
    )
  }

  if (urls.length === 0) {
    return showEmpty ? (
      <p className="mt-8 text-sm text-muted">Zatím žádné fotografie.</p>
    ) : null
  }

  return (
    <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {urls.map((preview) => (
        <GalleryImage alt={alt} key={preview.id} src={preview.url} />
      ))}
    </div>
  )
}
