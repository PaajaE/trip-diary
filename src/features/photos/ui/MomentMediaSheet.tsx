import { useMutation } from '@tanstack/react-query'
import { Crop, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import { deletePhoto } from '@/entities/photo/api/photo-mutation.repository'
import { setEntryCoverPhoto } from '@/entities/photo/api/photo-mutation.repository'
import {
  PHOTO_CAPTION_MAX_LENGTH,
  updateEntryPhotoCaption,
} from '@/entities/photo/api/moment-photo-detail.repository'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { CoverFocalPointSheet } from '@/features/photos/ui/CoverFocalPointSheet'
import {
  coverObjectPositionStyle,
  focalFromPreview,
  normalizeCoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'
import { useToast } from '@/shared/ui/use-toast'

interface MomentMediaSheetProps {
  alt: string
  caption: string
  creatorId: string
  entryId: string
  isCover: boolean
  onClose: () => void
  onCoverChanged: () => void
  onRemoved: () => void
  open: boolean
  photo: PhotoPreview
  previewUrl: string
}

export function MomentMediaSheet({
  alt,
  caption: initialCaption,
  creatorId,
  entryId,
  isCover,
  onClose,
  onCoverChanged,
  onRemoved,
  open,
  photo,
  previewUrl,
}: MomentMediaSheetProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [captionDraftKey, setCaptionDraftKey] = useState(photo.id)
  const [caption, setCaption] = useState(initialCaption)
  const [focalOpen, setFocalOpen] = useState(false)

  if (open && captionDraftKey !== photo.id) {
    setCaptionDraftKey(photo.id)
    setCaption(initialCaption)
  }

  const coverMutation = useMutation({
    mutationFn: () => setEntryCoverPhoto(entryId, photo.id),
    onError: () => {
      showToast({ message: t('entry.coverUpdateFailed'), variant: 'error' })
    },
    onSuccess: () => {
      onCoverChanged()
      showToast({ message: t('entry.coverUpdated'), variant: 'default' })
    },
  })

  const captionMutation = useMutation({
    mutationFn: () => updateEntryPhotoCaption(entryId, photo.id, caption),
    onError: () => {
      showToast({
        message: t('entry.photoCaptionSaveFailed'),
        variant: 'error',
      })
    },
    onSuccess: () => {
      showToast({ message: t('entry.photoCaptionSaved'), variant: 'default' })
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => deletePhoto(photo.id, creatorId),
    onError: () => {
      showToast({ message: t('entry.photoRemoveFailed'), variant: 'error' })
    },
    onSuccess: () => {
      onRemoved()
      onClose()
      showToast({ message: t('entry.photoRemoved'), variant: 'default' })
    },
  })

  const focalStyle = isCover
    ? coverObjectPositionStyle(focalFromPreview(photo), '50% 50%')
    : undefined

  return (
    <>
      <SoftBottomSheet
        closeLabel={t('entry.cancelEdit')}
        onClose={onClose}
        open={open}
        title={t('entry.mediaSheetTitle')}
      >
        <div className="space-y-5 px-5 pb-6 pt-2">
          <div className="relative overflow-hidden rounded-2xl">
            <ResponsivePhotoImage
              alt={alt}
              className="aspect-[4/3] w-full object-cover"
              {...(typeof photo.height === 'number'
                ? { height: photo.height }
                : {})}
              sizes={GALLERY_GRID_SIZES}
              src={previewUrl}
              {...(focalStyle === undefined ? {} : { style: focalStyle })}
              {...(typeof photo.width === 'number'
                ? { width: photo.width }
                : {})}
            />
            {photo.mediaType === 'video' ? <VideoPlayOverlay /> : null}
            {isCover ? (
              <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                <Star aria-hidden="true" className="size-3 fill-current" />
                {t('entry.coverPhoto')}
              </span>
            ) : null}
          </div>

          <label className="block text-sm font-semibold">
            {t('entry.photoCaption')}
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              maxLength={PHOTO_CAPTION_MAX_LENGTH}
              onChange={(event) => {
                setCaption(event.target.value)
              }}
              placeholder={t('entry.photoCaptionPlaceholder')}
              value={caption}
            />
          </label>

          <div className="flex flex-col gap-2">
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={captionMutation.isPending}
              onClick={() => {
                captionMutation.mutate()
              }}
              type="button"
            >
              {t('entry.saveChanges')}
            </button>

            {!isCover ? (
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-semibold"
                disabled={coverMutation.isPending}
                onClick={() => {
                  coverMutation.mutate()
                }}
                type="button"
              >
                <Star aria-hidden="true" size={16} />
                {t('entry.setCoverPhoto')}
              </button>
            ) : (
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-semibold"
                onClick={() => {
                  setFocalOpen(true)
                }}
                type="button"
              >
                <Crop aria-hidden="true" size={16} />
                {t('entry.adjustCoverFocal')}
              </button>
            )}

            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-destructive"
              disabled={removeMutation.isPending}
              onClick={() => {
                if (window.confirm(t('entry.removePhotoConfirm'))) {
                  removeMutation.mutate()
                }
              }}
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
              {t('entry.removeFromMoment')}
            </button>
          </div>
        </div>
      </SoftBottomSheet>

      {isCover ? (
        <CoverFocalPointSheet
          alt={alt}
          entryId={entryId}
          initialFocal={normalizeCoverFocalPoint(photo.focalX, photo.focalY)}
          key={`${photo.id}:${String(photo.focalX)}:${String(photo.focalY)}`}
          onSaved={onCoverChanged}
          open={focalOpen}
          photoId={photo.id}
          {...(typeof photo.height === 'number'
            ? { previewHeight: photo.height }
            : {})}
          previewUrl={previewUrl}
          {...(typeof photo.width === 'number'
            ? { previewWidth: photo.width }
            : {})}
          setOpen={setFocalOpen}
        />
      ) : null}
    </>
  )
}
