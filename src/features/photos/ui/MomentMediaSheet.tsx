import { useMutation } from '@tanstack/react-query'
import { Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import {
  PHOTO_CAPTION_MAX_LENGTH,
  updateEntryCoverFocalPoint,
  updateEntryPhotoCaption,
} from '@/entities/photo/api/moment-photo-detail.repository'
import {
  deletePhoto,
  setEntryCoverPhoto,
} from '@/entities/photo/api/photo-mutation.repository'
import { resolvePhotoVideoSignedUrl } from '@/entities/photo/api/signed-video-url'
import {
  COVER_FOCAL_CENTER,
  normalizeCoverFocalPoint,
  type CoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { CoverFocalPicker } from '@/features/photos/ui/CoverFocalPicker'
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
  const [framing, setFraming] = useState(isCover)
  const [draftFocal, setDraftFocal] = useState<CoverFocalPoint>(
    normalizeCoverFocalPoint(photo.focalX, photo.focalY) ?? COVER_FOCAL_CENTER,
  )
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [playingVideo, setPlayingVideo] = useState(false)

  if (open && captionDraftKey !== photo.id) {
    setCaptionDraftKey(photo.id)
    setCaption(initialCaption)
    setFraming(isCover)
    setDraftFocal(
      normalizeCoverFocalPoint(photo.focalX, photo.focalY) ??
        COVER_FOCAL_CENTER,
    )
    setVideoUrl(null)
    setPlayingVideo(false)
  }

  if (open && isCover && !framing && captionDraftKey === photo.id) {
    setFraming(true)
  }

  const coverMutation = useMutation({
    mutationFn: () => setEntryCoverPhoto(entryId, photo.id),
    onError: () => {
      showToast({ message: t('entry.coverUpdateFailed'), variant: 'error' })
    },
    onSuccess: () => {
      setFraming(true)
      setDraftFocal(COVER_FOCAL_CENTER)
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

  const focalMutation = useMutation({
    mutationFn: (focal: CoverFocalPoint | null) =>
      updateEntryCoverFocalPoint(entryId, photo.id, focal),
    onError: () => {
      showToast({
        message: t('entry.coverFocalSaveFailed'),
        variant: 'error',
      })
    },
    onSuccess: () => {
      onCoverChanged()
      showToast({ message: t('entry.coverFocalSaved'), variant: 'default' })
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

  const saving =
    captionMutation.isPending ||
    focalMutation.isPending ||
    coverMutation.isPending ||
    removeMutation.isPending

  async function saveManageChanges() {
    await captionMutation.mutateAsync()
  }

  async function saveFramingChanges() {
    const captionPromise =
      caption !== initialCaption
        ? captionMutation.mutateAsync()
        : Promise.resolve()
    const normalized = normalizeCoverFocalPoint(draftFocal.x, draftFocal.y)
    await Promise.all([captionPromise, focalMutation.mutateAsync(normalized)])
  }

  async function playVideo() {
    if (videoUrl === null) {
      const url = await resolvePhotoVideoSignedUrl(photo.id)
      if (url === null) {
        return
      }
      setVideoUrl(url)
    }
    setPlayingVideo(true)
  }

  const showFraming = framing || isCover

  return (
    <SoftBottomSheet
      closeLabel={t('entry.cancelEdit')}
      onClose={onClose}
      open={open}
      size="wide"
      title={t('entry.mediaSheetTitle')}
    >
      <div className="space-y-5 pb-2 pt-2">
        {showFraming ? (
          <>
            <p className="text-sm leading-6 text-muted">
              {t('entry.coverFocalHint')}
            </p>
            <CoverFocalPicker
              alt={alt}
              draftFocal={draftFocal}
              onChange={setDraftFocal}
              previewUrl={previewUrl}
              {...(typeof photo.height === 'number'
                ? { previewHeight: photo.height }
                : {})}
              {...(typeof photo.width === 'number'
                ? { previewWidth: photo.width }
                : {})}
            />
          </>
        ) : (
          <div className="relative overflow-hidden rounded-2xl">
            {playingVideo && videoUrl !== null ? (
              <video
                autoPlay
                className="aspect-[4/3] w-full object-cover"
                controls
                playsInline
                preload="metadata"
                src={videoUrl}
              >
                <track kind="captions" />
              </video>
            ) : (
              <>
                <ResponsivePhotoImage
                  alt={alt}
                  className="aspect-[4/3] w-full object-cover"
                  {...(typeof photo.height === 'number'
                    ? { height: photo.height }
                    : {})}
                  sizes={GALLERY_GRID_SIZES}
                  src={previewUrl}
                  {...(typeof photo.width === 'number'
                    ? { width: photo.width }
                    : {})}
                />
                {photo.mediaType === 'video' ? (
                  <button
                    aria-label={t('photos.playVideo')}
                    className="absolute inset-0"
                    onClick={() => {
                      void playVideo()
                    }}
                    type="button"
                  >
                    <VideoPlayOverlay />
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}

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
            disabled={saving}
            onClick={() => {
              void (showFraming ? saveFramingChanges() : saveManageChanges())
            }}
            type="button"
          >
            {t('entry.saveChanges')}
          </button>

          {showFraming ? (
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-60"
              disabled={saving}
              onClick={() => {
                setDraftFocal(COVER_FOCAL_CENTER)
              }}
              type="button"
            >
              {t('entry.coverFocalReset')}
            </button>
          ) : (
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-60"
              disabled={saving}
              onClick={() => {
                coverMutation.mutate()
              }}
              type="button"
            >
              <Star aria-hidden="true" size={16} />
              {t('entry.setCoverPhoto')}
            </button>
          )}

          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-destructive disabled:opacity-60"
            disabled={saving}
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
  )
}
