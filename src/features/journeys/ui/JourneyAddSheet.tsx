import { Camera, MapPin, StickyNote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'

interface JourneyAddSheetProps {
  journeyId: string
  onAddNote: () => void
  onAddPhotos: () => void
  onAddPlace: () => void
  onClose: () => void
  open: boolean
}

export function JourneyAddSheet({
  onAddNote,
  onAddPhotos,
  onAddPlace,
  onClose,
  open,
}: JourneyAddSheetProps) {
  const { t } = useTranslation()

  return (
    <SoftBottomSheet
      closeLabel={t('journey.addSheetClose')}
      onClose={onClose}
      open={open}
      title={t('journey.addSheetTitle')}
    >
      <div className="space-y-3">
        <AddAction
          description={t('journey.addPhotosDescription')}
          icon={Camera}
          label={t('journey.addPhotos')}
          onClick={() => {
            onClose()
            onAddPhotos()
          }}
        />
        <AddAction
          description={t('journey.addPlaceDescription')}
          icon={MapPin}
          label={t('journey.addPlace')}
          onClick={() => {
            onClose()
            onAddPlace()
          }}
        />
        <AddAction
          description={t('journey.addNoteDescription')}
          icon={StickyNote}
          label={t('journey.addNote')}
          onClick={() => {
            onClose()
            onAddNote()
          }}
        />
      </div>
    </SoftBottomSheet>
  )
}

function AddAction({
  description,
  icon: Icon,
  label,
  onClick,
}: {
  description: string
  icon: typeof Camera
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="flex w-full items-start gap-4 rounded-xl border border-border bg-background/60 p-4 text-left transition hover:bg-background"
      onClick={onClick}
      type="button"
    >
      <span className="rounded-full bg-primary/10 p-2.5 text-primary">
        <Icon aria-hidden="true" size={20} />
      </span>
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="mt-1 block text-sm leading-6 text-muted">
          {description}
        </span>
      </span>
    </button>
  )
}
