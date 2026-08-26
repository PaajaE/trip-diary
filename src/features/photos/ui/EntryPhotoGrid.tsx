import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import { setEntryCoverPhoto } from '@/entities/photo/api/photo-mutation.repository'
import {
  PHOTO_CAPTION_MAX_LENGTH,
  updateEntryPhotoCaption,
} from '@/entities/photo/api/moment-photo-detail.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { useToast } from '@/shared/ui/use-toast'
import { cn } from '@/shared/lib/cn'

interface EntryPhotoGridProps {
  alt: string
  canDelete?: boolean
  canEditCaptions?: boolean
  canEditTags?: boolean
  canSetCover?: boolean
  creatorId?: string
  entryId: string
  journeyId?: string
  onCoverChanged?: () => void
  onOpenMoment?: (entryId: string) => void
  photos: PhotoPreview[]
  showPhotoEngagement?: boolean
  tagsByPhotoId?: Map<string, PhotoTagAssignment[]>
}

function GridImage({
  alt,
  coverLabel,
  height,
  isCover,
  isSelected,
  onOpen,
  onSelect,
  onSetCover,
  setCoverLabel,
  src,
  width,
}: {
  alt: string
  coverLabel: string
  height?: number
  isCover: boolean
  isSelected: boolean
  onOpen: () => void
  onSelect?: () => void
  onSetCover?: () => void
  setCoverLabel: string
  src: string
  width?: number
}) {
  const [isBroken, setIsBroken] = useState(false)

  if (isBroken) {
    return (
      <div className="relative flex aspect-square w-full items-center justify-center rounded-md bg-muted/40 text-center text-xs text-muted">
        {alt}
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        aria-label={alt}
        className={cn(
          'block w-full overflow-hidden rounded-md focus-visible:outline-offset-2',
          isCover && 'ring-2 ring-primary ring-offset-2',
          isSelected && 'ring-2 ring-accent ring-offset-2',
        )}
        onClick={() => {
          onSelect?.()
          onOpen()
        }}
        type="button"
      >
        <ResponsivePhotoImage
          alt={alt}
          className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
          {...(typeof height === 'number' ? { height } : {})}
          onError={() => {
            setIsBroken(true)
          }}
          sizes={GALLERY_GRID_SIZES}
          src={src}
          {...(typeof width === 'number' ? { width } : {})}
        />
      </button>
      {isCover ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          {coverLabel}
        </span>
      ) : null}
      {onSetCover !== undefined && !isCover ? (
        <button
          aria-label={setCoverLabel}
          className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          onClick={(event) => {
            event.stopPropagation()
            onSetCover()
          }}
          type="button"
        >
          {setCoverLabel}
        </button>
      ) : null}
      {onSelect !== undefined ? (
        <button
          className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          onClick={(event) => {
            event.stopPropagation()
            onSelect()
          }}
          type="button"
        >
          …
        </button>
      ) : null}
    </div>
  )
}

export function EntryPhotoGrid({
  alt,
  canDelete = false,
  canEditCaptions = false,
  canEditTags = false,
  canSetCover = false,
  creatorId,
  entryId,
  journeyId,
  onCoverChanged,
  onOpenMoment,
  photos,
  showPhotoEngagement = false,
  tagsByPhotoId,
}: EntryPhotoGridProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [draftCaption, setDraftCaption] = useState('')
  const urls = usePhotoObjectUrls(photos)
  const { lightboxElement, openLightbox } = usePhotoLightbox({
    canDelete,
    canEditTags: canEditTags && journeyId !== undefined,
    ...(creatorId !== undefined ? { creatorId } : {}),
    ...(journeyId !== undefined ? { journeyId } : {}),
    ...(onOpenMoment !== undefined ? { onOpenMoment } : {}),
    photoEngagement: showPhotoEngagement,
    ...(tagsByPhotoId !== undefined ? { tagsByPhotoId } : {}),
  })

  const captionsQuery = useQuery({
    enabled: canEditCaptions && photos.length > 0,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from('entry_photos')
        .select('photo_id, caption')
        .eq('entry_id', entryId)
      if (error !== null) {
        throw error
      }
      return new Map(
        data.map((row) => [
          row.photo_id,
          typeof row.caption === 'string' ? row.caption : '',
        ]),
      )
    },
    queryKey: [...entryQueryKeys.detail(entryId), 'captions'],
  })

  const coverMutation = useMutation({
    mutationFn: (photoId: string) => setEntryCoverPhoto(entryId, photoId),
    onError: () => {
      showToast({ message: t('entry.coverUpdateFailed'), variant: 'error' })
    },
    onSuccess: async () => {
      if (journeyId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: journeyQueryKeys.detail(journeyId),
        })
      }
      onCoverChanged?.()
      showToast({ message: t('entry.coverUpdated'), variant: 'default' })
    },
  })

  const captionMutation = useMutation({
    mutationFn: ({ caption, photoId }: { caption: string; photoId: string }) =>
      updateEntryPhotoCaption(entryId, photoId, caption),
    onError: () => {
      showToast({
        message: t('entry.photoCaptionSaveFailed'),
        variant: 'error',
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [...entryQueryKeys.detail(entryId), 'captions'],
      })
      await queryClient.invalidateQueries({
        queryKey: entryQueryKeys.publicMomentPhotos(entryId),
      })
      showToast({ message: t('entry.photoCaptionSaved'), variant: 'default' })
    },
  })

  if (photos.length > 0 && urls.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted" role="status">
        {t('photos.loading')}
      </p>
    )
  }

  if (urls.length === 0) {
    return null
  }

  const coverId =
    photos.find((photo) => photo.isCover === true)?.id ?? photos[0]?.id ?? null

  const lightboxPhotos = urls.map((preview) => ({
    alt,
    caption: captionsQuery.data?.get(preview.id) ?? null,
    entryId,
    id: preview.id,
    thumbUrl: preview.url,
  }))

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((preview, previewIndex) => {
          const isCover = preview.id === coverId
          const meta = photos.find((photo) => photo.id === preview.id)
          return (
            <GridImage
              alt={`${alt} ${String(previewIndex + 1)}`}
              coverLabel={t('entry.coverPhoto')}
              {...(typeof meta?.height === 'number'
                ? { height: meta.height }
                : {})}
              isCover={isCover}
              isSelected={selectedPhotoId === preview.id}
              key={preview.id}
              onOpen={() => {
                openLightbox(lightboxPhotos, previewIndex)
              }}
              {...(canEditCaptions
                ? {
                    onSelect: () => {
                      setSelectedPhotoId(preview.id)
                      setDraftCaption(captionsQuery.data?.get(preview.id) ?? '')
                    },
                  }
                : {})}
              {...(canSetCover && !isCover
                ? {
                    onSetCover: () => {
                      coverMutation.mutate(preview.id)
                    },
                  }
                : {})}
              setCoverLabel={t('entry.setCoverPhoto')}
              src={preview.url}
              {...(typeof meta?.width === 'number' ? { width: meta.width } : {})}
            />
          )
        })}
      </div>

      {canEditCaptions && selectedPhotoId !== null ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <label className="block text-sm font-semibold text-foreground">
            {t('entry.photoCaption')}
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              maxLength={PHOTO_CAPTION_MAX_LENGTH}
              onChange={(event) => {
                setDraftCaption(event.target.value)
              }}
              placeholder={t('entry.photoCaptionPlaceholder')}
              value={draftCaption}
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-white"
              disabled={captionMutation.isPending}
              onClick={() => {
                captionMutation.mutate({
                  caption: draftCaption,
                  photoId: selectedPhotoId,
                })
              }}
              type="button"
            >
              {t('entry.saveChanges')}
            </button>
            <button
              className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted"
              onClick={() => {
                setSelectedPhotoId(null)
              }}
              type="button"
            >
              {t('entry.cancelEdit')}
            </button>
          </div>
        </div>
      ) : null}
      {lightboxElement}
    </>
  )
}
