import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  COVER_FOCAL_CENTER,
  normalizeCoverFocalPoint,
  type CoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import { updateEntryCoverFocalPoint } from '@/entities/photo/api/moment-photo-detail.repository'
import { CoverFocalPicker } from '@/features/photos/ui/CoverFocalPicker'
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

  return (
    <SoftBottomSheet
      closeLabel={t('entry.cancelEdit')}
      onClose={() => {
        setOpen(false)
      }}
      open={open}
      title={t('entry.coverFocalTitle')}
    >
      <div className="space-y-4 pb-2 pt-2">
        <p className="text-sm leading-6 text-muted">
          {t('entry.coverFocalHint')}
        </p>
        <CoverFocalPicker
          alt={alt}
          draftFocal={draftFocal}
          onChange={setDraftFocal}
          previewUrl={previewUrl}
          {...(typeof previewHeight === 'number' ? { previewHeight } : {})}
          {...(typeof previewWidth === 'number' ? { previewWidth } : {})}
        />
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
