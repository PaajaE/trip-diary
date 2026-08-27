import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  coverObjectPositionStyle,
  type CoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'

interface CoverFocalPickerProps {
  alt: string
  draftFocal: CoverFocalPoint
  onChange: (focal: CoverFocalPoint) => void
  previewHeight?: number
  previewUrl: string
  previewWidth?: number
}

export function CoverFocalPicker({
  alt,
  draftFocal,
  onChange,
  previewHeight,
  previewUrl,
  previewWidth,
}: CoverFocalPickerProps) {
  const { t } = useTranslation()
  const frameRef = useRef<HTMLButtonElement>(null)

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
    onChange({ x, y })
  }

  return (
    <button
      aria-label={t('entry.coverFocalTitle')}
      className="relative block w-full overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={(event) => {
        updateFocalFromPointer(event.clientX, event.clientY)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          updateFocalFromPointer(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
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
        {...(typeof previewWidth === 'number' ? { width: previewWidth } : {})}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-soft"
        style={{
          left: `${String(draftFocal.x * 100)}%`,
          top: `${String(draftFocal.y * 100)}%`,
        }}
      />
    </button>
  )
}
