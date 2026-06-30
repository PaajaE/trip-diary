import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { getPhotoDetailPreview } from '@/entities/photo/api/photo-gallery.repository'
import { PhotoTagEditor } from '@/features/photos/ui/PhotoTagEditor'
import { PhotoTagList } from '@/features/photos/ui/PhotoTagList'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { createPreviewUrl, revokePreviewUrl } from '@/shared/lib/preview-url'
import { Button } from '@/shared/ui/Button'

export interface PhotoLightboxItem {
  alt: string
  entryId?: string
  id: string
  thumbUrl: string
}

interface PhotoLightboxProps {
  canDelete?: boolean
  canEditTags?: boolean
  creatorId?: string
  initialIndex?: number
  journeyId?: string
  onClose: () => void
  onDelete?: (photoId: string) => Promise<void>
  onOpenMoment?: (entryId: string) => void
  onTagsChanged?: () => void
  photoEngagement?: boolean
  photos: PhotoLightboxItem[]
  tagsByPhotoId?: Map<string, PhotoTagAssignment[]>
}

export function PhotoLightbox({
  canDelete = false,
  canEditTags = false,
  creatorId,
  initialIndex = 0,
  journeyId,
  onClose,
  onDelete,
  onOpenMoment,
  onTagsChanged,
  photoEngagement = false,
  photos,
  tagsByPhotoId,
}: PhotoLightboxProps) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(initialIndex)
  const [detailUrls, setDetailUrls] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState(false)
  const loadedIdsRef = useRef(new Set<string>())
  const touchStartX = useRef<number | null>(null)
  const activePhoto = photos[index]

  const loadDetail = useCallback(async (photoId: string) => {
    if (loadedIdsRef.current.has(photoId)) {
      return
    }
    loadedIdsRef.current.add(photoId)
    const preview = await getPhotoDetailPreview(photoId)
    if (preview === null || preview === undefined) {
      return
    }
    const url = await createPreviewUrl(preview.blob)
    setDetailUrls((previous) => ({ ...previous, [photoId]: url }))
  }, [])

  useEffect(() => {
    if (activePhoto === undefined) {
      return
    }
    void loadDetail(activePhoto.id)
    const next = photos[index + 1]
    const previous = photos[index - 1]
    if (next !== undefined) {
      void loadDetail(next.id)
    }
    if (previous !== undefined) {
      void loadDetail(previous.id)
    }
  }, [activePhoto, index, loadDetail, photos])

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
        onClose()
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
  }, [onClose, photos.length])

  if (activePhoto === undefined) {
    return null
  }

  const displayUrl = detailUrls[activePhoto.id] ?? activePhoto.thumbUrl
  const activeTags = tagsByPhotoId?.get(activePhoto.id) ?? []

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <p className="text-sm font-medium">
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
                      onClose()
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
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center touch-pan-y"
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
          className="max-h-[calc(100svh-8rem)] max-w-full object-contain px-4"
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

      <div className="flex w-full max-w-2xl flex-col items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-white">
        <p className="max-w-xl truncate text-sm text-white/80">
          {activePhoto.alt}
        </p>
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
        {activePhoto.entryId !== undefined && onOpenMoment !== undefined ? (
          <button
            className="text-sm font-semibold text-white underline-offset-4 hover:underline"
            onClick={() => {
              onOpenMoment(activePhoto.entryId!)
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
