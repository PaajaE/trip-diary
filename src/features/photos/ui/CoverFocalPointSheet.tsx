import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  COVER_FOCAL_CENTER,
  coverObjectPositionStyle,
  normalizeCoverFocalPoint,
  type CoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import { updateEntryCoverFocalPoint } from '@/entities/photo/api/moment-photo-detail.repository'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'
import { useToast } from '@/shared/ui/use-toast'

interface CoverFocalPointSheetProps {
  alt: string
  entryId: string
  initialFocal: CoverFocalPoint | null
  onSaved: () => void
  open: boolean
  photoId: string
  previewHeight?: number
  previewUrl: string
  previewWidth?: number
  setOpen: (open: boolean) => void
}

export function CoverFocalPointSheet({
  alt,
  entryId,
  initialFocal,
  onSaved,
  open,
  photoId,
  previewHeight,
  previewUrl,
  previewWidth,
  setOpen,
}: CoverFocalPointSheetProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const frameRef = useRef<HTMLButtonElement>(null)
  const [draftFocal, setDraftFocal] = useState<CoverFocalPoint>(
    initialFocal ?? COVER_FOCAL_CENTER,
  )

  const saveMutation = useMutation({
    mutationFn: (focal: CoverFocalPoint | null) =>
      updateEntryCoverFocalPoint(entryId, photoId, focal),
    onError: () => {
      showToast({
        message: t('entry.coverFocalSaveFailed'),
        variant: 'error',
      })
    },
    onSuccess: () => {
      onSaved()
      showToast({ message: t('entry.coverFocalSaved'), variant: 'default' })
      setOpen(false)
    },
  })

  function updateFocalFromPointer(clientX: number, clientY: number) {
    const frame = frameRef.current
    if (frame === null) {
      return
    }
    const rect = frame.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    setDraftFocal({ x, y })
  }

  const markerStyle = {
    left: `${String(draftFocal.x * 100)}%`,
    top: `${String(draftFocal.y * 100)}%`,
  }

  return (
    <SoftBottomSheet
      closeLabel={t('entry.cancelEdit')}
      onClose={() => {
        setOpen(false)
      }}
      open={open}
      title={t('entry.coverFocalTitle')}
    >
      <div className="space-y-4 px-5 pb-6 pt-2">
        <p className="text-sm leading-6 text-muted">
          {t('entry.coverFocalHint')}
        </p>
        <button
          aria-label={t('entry.coverFocalTitle')}
          className="relative block w-full overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={(event) => {
            updateFocalFromPointer(event.clientX, event.clientY)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              updateFocalFromPointer(
                event.currentTarget.getBoundingClientRect().left +
                  event.currentTarget.getBoundingClientRect().width / 2,
                event.currentTarget.getBoundingClientRect().top +
                  event.currentTarget.getBoundingClientRect().height / 2,
              )
            }
          }}
          ref={frameRef}
          type="button"
        >
          <ResponsivePhotoImage
            alt={alt}
            className="aspect-[16/10] w-full object-cover"
            decorative={false}
            draggable={false}
            {...(typeof previewHeight === 'number'
              ? { height: previewHeight }
              : {})}
            sizes={GALLERY_GRID_SIZES}
            src={previewUrl}
            style={coverObjectPositionStyle(draftFocal, '50% 50%')}
            {...(typeof previewWidth === 'number'
              ? { width: previewWidth }
              : {})}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-soft"
            style={markerStyle}
          />
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
            disabled={saveMutation.isPending}
            onClick={() => {
              const normalized = normalizeCoverFocalPoint(
                draftFocal.x,
                draftFocal.y,
              )
              saveMutation.mutate(normalized)
            }}
            type="button"
          >
            {t('entry.saveChanges')}
          </button>
          <button
            className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted"
            disabled={saveMutation.isPending}
            onClick={() => {
              setDraftFocal(COVER_FOCAL_CENTER)
            }}
            type="button"
          >
            {t('entry.coverFocalReset')}
          </button>
        </div>
      </div>
    </SoftBottomSheet>
  )
}
