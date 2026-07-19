import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { PhotoNatureSpotting } from '@/features/nature/ui/PhotoNatureSpotting'
import { getPhotoDetailPreview } from '@/entities/photo/api/photo-gallery.repository'
import { PhotoTagEditor } from '@/features/photos/ui/PhotoTagEditor'
import { PhotoTagList } from '@/features/photos/ui/PhotoTagList'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { createPreviewUrl, revokePreviewUrl } from '@/shared/lib/preview-url'
import { Button } from '@/shared/ui/Button'

export interface PhotoLightboxItem {
  alt: string
  caption?: string | null
  capturedAt?: string | null
  entryId?: string
  id: string
  latitude?: number | null
  longitude?: number | null
  thumbUrl: string
}

interface PhotoLightboxProps {
  canDelete?: boolean
  canEditTags?: boolean
  canLogObservation?: boolean
  creatorId?: string
  initialIndex?: number
  journeyId?: string
  onClose: () => void
  onDelete?: (photoId: string) => Promise<void>
  onOpenMoment?: (entryId: string) => void
  onShowOnMap?: (photoId: string) => void
  onTagsChanged?: () => void
  photoEngagement?: boolean
  photos: PhotoLightboxItem[]
  returnFocusRef?: RefObject<HTMLElement | null>
  tagsByPhotoId?: Map<string, PhotoTagAssignment[]>
}

export function PhotoLightbox({
  canDelete = false,
  canEditTags = false,
  canLogObservation = false,
  creatorId,
  initialIndex = 0,
  journeyId,
  onClose,
  onDelete,
  onOpenMoment,
  onShowOnMap,
  onTagsChanged,
  photoEngagement = false,
  photos,
  returnFocusRef,
  tagsByPhotoId,
}: PhotoLightboxProps) {
  const { t } = useTranslation()
  const counterId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusElementRef = useRef<HTMLElement | null>(null)
  const [index, setIndex] = useState(initialIndex)
  const [detailUrls, setDetailUrls] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState(false)
  const loadedIdsRef = useRef(new Set<string>())
  const touchStartX = useRef<number | null>(null)
  const activePhoto = photos[index]

  const fetchDetailUrl = useCallback(async (photoId: string) => {
    if (loadedIdsRef.current.has(photoId)) {
      return null
    }
    loadedIdsRef.current.add(photoId)
    const preview = await getPhotoDetailPreview(photoId)
    if (preview === null) {
      return null
    }
    return createPreviewUrl(preview.blob)
  }, [])

  useEffect(() => {
    if (activePhoto === undefined) {
      return
    }

    const photoIds = [
      activePhoto.id,
      photos[index + 1]?.id,
      photos[index - 1]?.id,
    ].filter((photoId): photoId is string => photoId !== undefined)

    for (const photoId of photoIds) {
      void fetchDetailUrl(photoId).then((url) => {
        if (url === null) {
          return
        }
        setDetailUrls((previous) => ({ ...previous, [photoId]: url }))
      })
    }
  }, [activePhoto, fetchDetailUrl, index, photos])

  useEffect(() => {
    returnFocusElementRef.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null)
  }, [returnFocusRef])

  const handleClose = useCallback(() => {
    const elementToFocus = returnFocusElementRef.current
    onClose()
    if (elementToFocus !== null && document.contains(elementToFocus)) {
      elementToFocus.focus()
    }
  }, [onClose])

  useEffect(() => {
    closeButtonRef.current?.focus()

    const root = dialogRef.current
    if (root === null) {
      return
    }
    const dialogRoot = root

    function getFocusableElements() {
      return Array.from(
        dialogRoot.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'))
    }

    function onTabKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') {
        return
      }

      const focusable = getFocusableElements()
      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (first === undefined || last === undefined) {
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialogRoot.addEventListener('keydown', onTabKeyDown)
    return () => {
      dialogRoot.removeEventListener('keydown', onTabKeyDown)
    }
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [])

  useEffect(() => {
    return () => {
      for (const url of Object.values(detailUrls)) {
        revokePreviewUrl(url)
      }
    }
  }, [detailUrls])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleClose()
      } else if (event.key === 'ArrowRight') {
        setIndex((current) => Math.min(current + 1, photos.length - 1))
      } else if (event.key === 'ArrowLeft') {
        setIndex((current) => Math.max(current - 1, 0))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [handleClose, photos.length])

  if (activePhoto === undefined) {
    return null
  }

  const displayUrl = detailUrls[activePhoto.id] ?? activePhoto.thumbUrl
  const activeTags = tagsByPhotoId?.get(activePhoto.id) ?? []
  const canSpotNature =
    canLogObservation && creatorId !== undefined && journeyId !== undefined
  const momentEntryId = activePhoto.entryId

  return (
    <div
      aria-labelledby={counterId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex h-svh min-h-0 flex-col overflow-hidden bg-black/95"
      ref={dialogRef}
      role="dialog"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <p className="text-sm font-medium" id={counterId}>
          {t('photos.lightboxCounter', {
            current: index + 1,
            total: photos.length,
          })}
        </p>
        <div className="flex items-center gap-2">
          {canDelete && onDelete !== undefined ? (
            <Button
              aria-label={t('photos.deleteAction')}
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
              disabled={deleting}
              onClick={() => {
                if (!window.confirm(t('photos.deleteConfirm'))) {
                  return
                }
                setDeleting(true)
                void onDelete(activePhoto.id)
                  .then(() => {
                    if (photos.length <= 1) {
                      handleClose()
                      return
                    }
                    setIndex((current) => Math.min(current, photos.length - 2))
                  })
                  .finally(() => {
                    setDeleting(false)
                  })
              }}
              type="button"
              variant="secondary"
            >
              <Trash2 aria-hidden="true" size={16} />
            </Button>
          ) : null}
          <button
            aria-label={t('photos.lightboxClose')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
            onClick={handleClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden touch-pan-y"
        onTouchEnd={(event) => {
          const startX = touchStartX.current
          touchStartX.current = null
          if (startX === null) {
            return
          }
          const deltaX = event.changedTouches[0]?.clientX ?? startX
          const distance = deltaX - startX
          if (distance > 64) {
            setIndex((current) => Math.max(current - 1, 0))
          } else if (distance < -64) {
            setIndex((current) => Math.min(current + 1, photos.length - 1))
          }
        }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null
        }}
      >
        {index > 0 ? (
          <button
            aria-label={t('photos.lightboxPrevious')}
            className="absolute left-2 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 sm:left-4"
            onClick={() => {
              setIndex((current) => Math.max(current - 1, 0))
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={24} />
          </button>
        ) : null}

        <img
          alt={activePhoto.alt}
          className="max-h-full max-w-full object-contain px-4"
          src={displayUrl}
        />

        {index < photos.length - 1 ? (
          <button
            aria-label={t('photos.lightboxNext')}
            className="absolute right-2 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 sm:right-4"
            onClick={() => {
              setIndex((current) => Math.min(current + 1, photos.length - 1))
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={24} />
          </button>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-2xl shrink-0 touch-pan-y flex-col items-center gap-3 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-white [max-height:min(50svh,28rem)]">
        {activePhoto.caption !== null &&
        activePhoto.caption !== undefined &&
        activePhoto.caption.trim().length > 0 ? (
          <p className="max-w-xl whitespace-pre-wrap text-base leading-relaxed text-white">
            {activePhoto.caption}
          </p>
        ) : (
          <p className="max-w-xl truncate text-sm text-white/80">
            {activePhoto.alt}
          </p>
        )}
        {activePhoto.capturedAt !== null &&
        activePhoto.capturedAt !== undefined ? (
          <p className="text-xs text-white/60">
            {t('photos.capturedAt', {
              date: activePhoto.capturedAt,
            })}
          </p>
        ) : null}
        {activePhoto.latitude !== null &&
        activePhoto.latitude !== undefined &&
        activePhoto.longitude !== null &&
        activePhoto.longitude !== undefined &&
        onShowOnMap !== undefined ? (
          <button
            className="text-sm font-semibold text-white underline-offset-4 hover:underline"
            onClick={() => {
              onShowOnMap(activePhoto.id)
            }}
            type="button"
          >
            {t('reader.openPhotoOnMap')}
          </button>
        ) : null}
        {activeTags.length > 0 ? (
          <PhotoTagList className="justify-center" tags={activeTags} />
        ) : null}
        {canEditTags && creatorId !== undefined && journeyId !== undefined ? (
          <PhotoTagEditor
            assignedTags={activeTags}
            creatorId={creatorId}
            journeyId={journeyId}
            {...(onTagsChanged !== undefined
              ? { onChanged: onTagsChanged }
              : {})}
            photoId={activePhoto.id}
          />
        ) : null}
        {canSpotNature ? (
          <PhotoNatureSpotting
            creatorId={creatorId}
            {...(momentEntryId !== undefined ? { entryId: momentEntryId } : {})}
            journeyId={journeyId}
            {...(onTagsChanged !== undefined
              ? { onChanged: onTagsChanged }
              : {})}
            photoId={activePhoto.id}
          />
        ) : null}
        {momentEntryId !== undefined && onOpenMoment !== undefined ? (
          <button
            className="text-sm font-semibold text-white underline-offset-4 hover:underline"
            onClick={() => {
              onOpenMoment(momentEntryId)
            }}
            type="button"
          >
            {t('photos.openMoment')}
          </button>
        ) : null}
        {photoEngagement ? (
          <ContentEngagement
            compact
            target={{ id: activePhoto.id, type: 'photo' }}
            tone="inverse"
          />
        ) : null}
      </div>
    </div>
  )
}
