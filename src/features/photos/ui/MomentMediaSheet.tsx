import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Star, Trash2 } from 'lucide-react'
import { useRef, useState, type CSSProperties } from 'react'
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
import { getPhotoSrcsetSources } from '@/entities/photo/api/photo-srcset.repository'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import { resolvePhotoVideoSignedUrl } from '@/entities/photo/api/signed-video-url'
import {
  COVER_FOCAL_CENTER,
  normalizeCoverFocalPoint,
  type CoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import { buildResponsivePhotoSources, type PhotoSrcsetSource } from '@/entities/photo/lib/responsive-photo'
import { CoverFocalPicker } from '@/features/photos/ui/CoverFocalPicker'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'
import { useToast } from '@/shared/ui/use-toast'
import { cn } from '@/shared/lib/cn'

/** Sheet preview ~full sheet width; prefer small/medium, never force full. */
const SHEET_PREVIEW_SIZES =
  '(max-width: 640px) 100vw, min(42rem, 92vw)'

const SHEET_SRCSET_VARIANTS = ['small', 'medium'] as const

interface SheetPreviewImageProps {
  alt: string
  className?: string
  previewUrl: string
  srcSetSources?: readonly PhotoSrcsetSource[]
  style?: CSSProperties
}

/** Prefer signed small/medium; fall back to blob if signed fails. */
function SheetPreviewImage({
  alt,
  className,
  previewUrl,
  srcSetSources,
  style,
}: SheetPreviewImageProps) {
  const [preferSigned, setPreferSigned] = useState(true)
  const responsive =
    preferSigned && srcSetSources !== undefined && srcSetSources.length > 0
      ? buildResponsivePhotoSources(srcSetSources, {
          sizes: SHEET_PREVIEW_SIZES,
        })
      : null
  const signedSrc = responsive?.src

  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      loading="eager"
      onError={() => {
        setPreferSigned(false)
      }}
      sizes={SHEET_PREVIEW_SIZES}
      src={signedSrc ?? previewUrl}
      {...(style === undefined ? {} : { style })}
      {...(responsive?.srcSet === undefined ? {} : { srcSet: responsive.srcSet })}
    />
  )
}

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

function sameFocal(left: CoverFocalPoint, right: CoverFocalPoint): boolean {
  return left.x === right.x && left.y === right.y
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
  const [draftKey, setDraftKey] = useState(photo.id)
  const [caption, setCaption] = useState(initialCaption)
  const [savedCaption, setSavedCaption] = useState(initialCaption)
  const [coverSelected, setCoverSelected] = useState(isCover)
  const initialFocal =
    normalizeCoverFocalPoint(photo.focalX, photo.focalY) ?? COVER_FOCAL_CENTER
  const [draftFocal, setDraftFocal] = useState<CoverFocalPoint>(initialFocal)
  const [savedFocal, setSavedFocal] = useState<CoverFocalPoint>(initialFocal)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [playingVideo, setPlayingVideo] = useState(false)
  const pendingCoverRefreshRef = useRef(false)

  const sheetSrcsetQuery = useQuery({
    enabled: open && photo.mediaType !== 'video',
    queryFn: () => getPhotoSrcsetSources(photo.id, SHEET_SRCSET_VARIANTS),
    queryKey: photoQueryKeys.srcset(photo.id, 'sheet'),
  })
  const sheetSrcsetSources = sheetSrcsetQuery.data

  if (open && draftKey !== photo.id) {
    setDraftKey(photo.id)
    setCaption(initialCaption)
    setSavedCaption(initialCaption)
    setCoverSelected(isCover)
    const nextFocal =
      normalizeCoverFocalPoint(photo.focalX, photo.focalY) ??
      COVER_FOCAL_CENTER
    setDraftFocal(nextFocal)
    setSavedFocal(nextFocal)
    setVideoUrl(null)
    setPlayingVideo(false)
    pendingCoverRefreshRef.current = false
  }

  if (open && draftKey === photo.id && isCover && !coverSelected) {
    setCoverSelected(true)
  }

  const isCoverState = coverSelected || isCover

  const coverMutation = useMutation({
    mutationFn: () => setEntryCoverPhoto(entryId, photo.id),
    onError: () => {
      showToast({ message: t('entry.coverUpdateFailed'), variant: 'error' })
    },
    onSuccess: () => {
      setCoverSelected(true)
      setDraftFocal(COVER_FOCAL_CENTER)
      setSavedFocal(COVER_FOCAL_CENTER)
      setPlayingVideo(false)
      // Defer grid refresh until close so the open sheet keeps a live preview.
      pendingCoverRefreshRef.current = true
      showToast({ message: t('entry.coverUpdated'), variant: 'default' })
    },
  })

  const captionMutation = useMutation({
    mutationFn: (nextCaption: string) =>
      updateEntryPhotoCaption(entryId, photo.id, nextCaption),
    onError: () => {
      showToast({
        message: t('entry.photoCaptionSaveFailed'),
        variant: 'error',
      })
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
  })

  const removeMutation = useMutation({
    mutationFn: () => deletePhoto(photo.id, creatorId),
    onError: () => {
      showToast({ message: t('entry.photoRemoveFailed'), variant: 'error' })
    },
    onSuccess: () => {
      pendingCoverRefreshRef.current = false
      onRemoved()
      handleClose()
      showToast({ message: t('entry.photoRemoved'), variant: 'default' })
    },
  })

  const captionDirty = caption !== savedCaption
  const focalDirty = isCoverState && !sameFocal(draftFocal, savedFocal)
  const dirty = captionDirty || focalDirty
  const saving =
    captionMutation.isPending ||
    focalMutation.isPending ||
    coverMutation.isPending ||
    removeMutation.isPending

  function handleClose() {
    if (pendingCoverRefreshRef.current) {
      pendingCoverRefreshRef.current = false
      onCoverChanged()
    }
    onClose()
  }

  async function saveChanges() {
    if (!dirty || saving) {
      return
    }

    try {
      if (captionDirty) {
        await captionMutation.mutateAsync(caption)
        setSavedCaption(caption)
      }
      if (focalDirty) {
        const normalized = normalizeCoverFocalPoint(draftFocal.x, draftFocal.y)
        await focalMutation.mutateAsync(normalized)
        setSavedFocal(draftFocal)
        onCoverChanged()
      }
      showToast({
        message: focalDirty
          ? t('entry.coverFocalSaved')
          : t('entry.photoCaptionSaved'),
        variant: 'default',
      })
    } catch {
      // Per-mutation toasts already surface failures.
    }
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

  const previewDims = {
    ...(typeof photo.height === 'number' ? { previewHeight: photo.height } : {}),
    ...(typeof photo.width === 'number' ? { previewWidth: photo.width } : {}),
  }
  const srcSetProps =
    sheetSrcsetSources !== undefined && sheetSrcsetSources.length > 0
      ? { srcSetSources: sheetSrcsetSources }
      : {}

  return (
    <SoftBottomSheet
      closeLabel={t('entry.cancelEdit')}
      onClose={handleClose}
      open={open}
      size="wide"
      title={t('entry.mediaSheetTitle')}
    >
      <div className="flex flex-col gap-6 pb-1 pt-1">
        <div className="space-y-2">
          {isCoverState ? (
            <>
              <CoverFocalPicker
                alt={alt}
                draftFocal={draftFocal}
                onChange={setDraftFocal}
                previewUrl={previewUrl}
                sizes={SHEET_PREVIEW_SIZES}
                {...previewDims}
                {...srcSetProps}
              />
              <p className="text-sm leading-6 text-muted">
                {t('entry.coverFocalHint')}
              </p>
            </>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-background">
              {playingVideo && videoUrl !== null ? (
                <video
                  autoPlay
                  className="aspect-[16/10] w-full object-cover"
                  controls
                  playsInline
                  preload="metadata"
                  src={videoUrl}
                >
                  <track kind="captions" />
                </video>
              ) : (
                <>
                  <SheetPreviewImage
                    alt={alt}
                    className="aspect-[16/10] w-full object-cover"
                    key={photo.id}
                    previewUrl={previewUrl}
                    {...srcSetProps}
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
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">
            {t('entry.photoCaption')}
          </span>
          <textarea
            className="min-h-[5.5rem] w-full resize-y rounded-2xl border border-border/70 bg-background px-3.5 py-3 text-base leading-relaxed outline-none transition placeholder:text-muted/70 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
            maxLength={PHOTO_CAPTION_MAX_LENGTH}
            onChange={(event) => {
              setCaption(event.target.value)
            }}
            placeholder={t('entry.photoCaptionPlaceholder')}
            rows={3}
            value={caption}
          />
        </label>

        <section className="space-y-3" aria-label={t('entry.coverSectionTitle')}>
          <p className="text-sm font-semibold text-foreground">
            {t('entry.coverSectionTitle')}
          </p>
          {isCoverState ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80">
                <Check
                  aria-hidden="true"
                  className="size-4 text-primary"
                  strokeWidth={2.5}
                />
                {t('entry.coverPhotoConfirmed')}
              </p>
              <button
                className="min-h-9 rounded-lg px-2.5 text-sm font-medium text-muted transition hover:bg-background hover:text-foreground disabled:opacity-60"
                disabled={saving || sameFocal(draftFocal, COVER_FOCAL_CENTER)}
                onClick={() => {
                  setDraftFocal(COVER_FOCAL_CENTER)
                }}
                type="button"
              >
                {t('entry.coverFocalReset')}
              </button>
            </div>
          ) : (
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-surface disabled:opacity-60 sm:w-auto"
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
        </section>

        <button
          className={cn(
            'inline-flex min-h-11 w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold transition disabled:opacity-60',
            dirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border border-border/70 bg-background text-foreground hover:bg-surface',
          )}
          disabled={saving || !dirty}
          onClick={() => {
            void saveChanges()
          }}
          type="button"
        >
          {saving ? t('entry.saving') : t('entry.saveChanges')}
        </button>

        <div className="border-t border-border/40 pt-4">
          <button
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/5 disabled:opacity-60"
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
