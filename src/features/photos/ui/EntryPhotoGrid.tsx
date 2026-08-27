import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crop, Star } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import { setEntryCoverPhoto } from '@/entities/photo/api/photo-mutation.repository'
import {
  PHOTO_CAPTION_MAX_LENGTH,
  updateEntryPhotoCaption,
} from '@/entities/photo/api/moment-photo-detail.repository'
import {
  coverObjectPositionStyle,
  focalFromPreview,
  normalizeCoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import { getSupabaseClient } from '@/shared/api/supabase'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { CoverFocalPointSheet } from '@/features/photos/ui/CoverFocalPointSheet'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
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
  adjustFocalLabel,
  alt,
  canAdjustFocal,
  coverLabel,
  height,
  isCover,
  isSelected,
  isVideo = false,
  onAdjustFocal,
  onOpen,
  onSelect,
  onSetCover,
  photoPreview,
  setCoverLabel,
  src,
  width,
}: {
  adjustFocalLabel: string
  alt: string
  canAdjustFocal: boolean
  coverLabel: string
  height?: number
  isCover: boolean
  isSelected: boolean
  isVideo?: boolean
  onAdjustFocal?: () => void
  onOpen: () => void
  onSelect?: () => void
  onSetCover?: () => void
  photoPreview: PhotoPreview
  setCoverLabel: string
  src: string
  width?: number
}) {
  const [isBroken, setIsBroken] = useState(false)
  const focalStyle = isCover
    ? coverObjectPositionStyle(focalFromPreview(photoPreview), '50% 50%')
    : undefined

  if (isBroken) {
    return (
      <div className="relative flex aspect-square w-full items-center justify-center rounded-md bg-muted/40 text-center text-xs text-muted">
        {alt}
      </div>
    )
  }

  return (
    <div className="group relative">
      <button
        aria-label={alt}
        className={cn(
          'block w-full overflow-hidden rounded-md focus-visible:outline-offset-2',
          isCover && 'ring-1 ring-primary/40 ring-offset-1',
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
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          {...(typeof height === 'number' ? { height } : {})}
          onError={() => {
            setIsBroken(true)
          }}
          sizes={GALLERY_GRID_SIZES}
          src={src}
          {...(focalStyle === undefined ? {} : { style: focalStyle })}
          {...(typeof width === 'number' ? { width } : {})}
        />
        {isVideo ? <VideoPlayOverlay /> : null}
      </button>

      {isCover ? (
        <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          <Star aria-hidden="true" className="size-3 fill-current" />
          {coverLabel}
        </span>
      ) : null}

      {onSetCover !== undefined ? (
        <button
          aria-label={setCoverLabel}
          className="absolute inset-x-1 bottom-1 rounded-md bg-black/65 px-2 py-1.5 text-[11px] font-semibold text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onSetCover()
          }}
          type="button"
        >
          {setCoverLabel}
        </button>
      ) : null}

      {canAdjustFocal && isCover && onAdjustFocal !== undefined ? (
        <button
          aria-label={adjustFocalLabel}
          className="absolute right-1.5 top-1.5 inline-flex size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onAdjustFocal()
          }}
          type="button"
        >
          <Crop aria-hidden="true" size={14} />
        </button>
      ) : null}

      {onSelect !== undefined ? (
        <button
          className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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
  const [focalEditorPhotoId, setFocalEditorPhotoId] = useState<string | null>(
    null,
  )
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
      await queryClient.invalidateQueries({
        queryKey: entryQueryKeys.photoPreviews(entryId),
      })
      await queryClient.invalidateQueries({
        queryKey: entryQueryKeys.publicMomentPhotos(entryId),
      })
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
  const focalEditorPhoto =
    focalEditorPhotoId === null
      ? null
      : (photos.find((photo) => photo.id === focalEditorPhotoId) ?? null)
  const focalEditorUrl =
    focalEditorPhotoId === null
      ? null
      : (urls.find((preview) => preview.id === focalEditorPhotoId) ?? null)

  const lightboxPhotos = urls.map((preview) => ({
    alt,
    caption: captionsQuery.data?.get(preview.id) ?? null,
    entryId,
    id: preview.id,
    ...(preview.mediaType === 'video' ? { mediaType: 'video' as const } : {}),
    thumbUrl: preview.url,
  }))

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((preview, previewIndex) => {
          const isCover = preview.id === coverId
          const meta = photos.find((photo) => photo.id === preview.id)
          if (meta === undefined) {
            return null
          }
          return (
            <GridImage
              adjustFocalLabel={t('entry.adjustCoverFocal')}
              alt={`${alt} ${String(previewIndex + 1)}`}
              canAdjustFocal={canSetCover}
              coverLabel={t('entry.coverPhoto')}
              {...(typeof meta.height === 'number'
                ? { height: meta.height }
                : {})}
              isCover={isCover}
              isSelected={selectedPhotoId === preview.id}
              isVideo={meta.mediaType === 'video'}
              key={preview.id}
              onAdjustFocal={() => {
                setFocalEditorPhotoId(preview.id)
              }}
              onOpen={() => {
                openLightbox(lightboxPhotos, previewIndex)
              }}
              photoPreview={meta}
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
              {...(typeof meta.width === 'number' ? { width: meta.width } : {})}
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

      {focalEditorPhoto !== null && focalEditorUrl !== null ? (
        <CoverFocalPointSheet
          alt={alt}
          entryId={entryId}
          initialFocal={normalizeCoverFocalPoint(
            focalEditorPhoto.focalX,
            focalEditorPhoto.focalY,
          )}
          key={`${focalEditorPhoto.id}:${String(focalEditorPhoto.focalX)}:${String(focalEditorPhoto.focalY)}`}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: entryQueryKeys.photoPreviews(entryId),
            })
            void queryClient.invalidateQueries({
              queryKey: entryQueryKeys.publicMomentPhotos(entryId),
            })
            if (journeyId !== undefined) {
              void queryClient.invalidateQueries({
                queryKey: journeyQueryKeys.detail(journeyId),
              })
            }
            onCoverChanged?.()
          }}
          open={focalEditorPhotoId !== null}
          photoId={focalEditorPhoto.id}
          {...(typeof focalEditorPhoto.height === 'number'
            ? { previewHeight: focalEditorPhoto.height }
            : {})}
          previewUrl={focalEditorUrl.url}
          {...(typeof focalEditorPhoto.width === 'number'
            ? { previewWidth: focalEditorPhoto.width }
            : {})}
          setOpen={(open) => {
            if (!open) {
              setFocalEditorPhotoId(null)
            }
          }}
        />
      ) : null}

      {lightboxElement}
    </>
  )
}
