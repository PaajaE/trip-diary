import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  coverObjectPositionStyle,
  type CoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import {
  buildResponsivePhotoSources,
  GALLERY_GRID_SIZES,
  type PhotoSrcsetSource,
} from '@/entities/photo/lib/responsive-photo'

interface CoverFocalPickerProps {
  alt: string
  draftFocal: CoverFocalPoint
  onChange: (focal: CoverFocalPoint) => void
  previewHeight?: number
  previewUrl: string
  previewWidth?: number
  sizes?: string
  srcSetSources?: readonly PhotoSrcsetSource[]
}

export function CoverFocalPicker({
  alt,
  draftFocal,
  onChange,
  previewHeight,
  previewUrl,
  previewWidth,
  sizes = GALLERY_GRID_SIZES,
  srcSetSources,
}: CoverFocalPickerProps) {
  const { t } = useTranslation()
  const frameRef = useRef<HTMLButtonElement>(null)
  const [useSigned, setUseSigned] = useState(true)

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

  const responsive =
    useSigned && srcSetSources !== undefined && srcSetSources.length > 0
      ? buildResponsivePhotoSources(srcSetSources, {
          ...(sizes === undefined ? {} : { sizes }),
        })
      : null

  return (
    <button
      aria-label={t('entry.coverFocalTitle')}
      className="relative block w-full touch-none overflow-hidden rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
      onPointerDown={(event) => {
        // Keep the sheet from scrolling while placing the focal point on touch.
        if (event.pointerType === 'touch') {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          updateFocalFromPointer(event.clientX, event.clientY)
        }
      }}
      onPointerMove={(event) => {
        if (
          event.pointerType === 'touch' &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          updateFocalFromPointer(event.clientX, event.clientY)
        }
      }}
      ref={frameRef}
      type="button"
    >
      <img
        alt={alt}
        className="aspect-[16/10] w-full object-cover"
        decoding="async"
        draggable={false}
        loading="eager"
        onError={() => {
          setUseSigned(false)
        }}
        sizes={sizes}
        src={responsive?.src ?? previewUrl}
        style={coverObjectPositionStyle(draftFocal, '50% 50%')}
        {...(typeof previewHeight === 'number'
          ? { height: previewHeight }
          : {})}
        {...(typeof previewWidth === 'number' ? { width: previewWidth } : {})}
        {...(responsive?.srcSet === undefined
          ? {}
          : { srcSet: responsive.srcSet })}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-soft sm:size-4"
        style={{
          left: `${String(draftFocal.x * 100)}%`,
          top: `${String(draftFocal.y * 100)}%`,
        }}
      />
    </button>
  )
}
