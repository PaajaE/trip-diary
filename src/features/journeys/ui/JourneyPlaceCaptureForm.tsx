import { MapPin, Sparkles } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addJourneyStop,
  setJourneyStopLocation,
} from '@/entities/journey/api/journey.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { suggestPlaceLabel } from '@/features/journeys/lib/place-suggestion'
import { LocationPickerMap } from '@/features/journeys/ui/LocationPickerMap'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface JourneyPlaceCaptureFormProps {
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  onClose?: () => void
}

export function JourneyPlaceCaptureForm({
  creatorId,
  journey,
  onChanged,
  onClose,
}: JourneyPlaceCaptureFormProps) {
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [title, setTitle] = useState('')
  const [suggestingTitle, setSuggestingTitle] = useState(false)
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null)

  function handlePointSelected(point: { latitude: number; longitude: number }) {
    setSelectedPoint(point)
    if (title.trim() !== '' && title.trim() !== (suggestedTitle ?? '')) {
      setSuggestingTitle(false)
      return
    }

    const controller = new AbortController()
    setSuggestingTitle(true)

    void suggestPlaceLabel({
      language: i18n.language,
      latitude: point.latitude,
      longitude: point.longitude,
      signal: controller.signal,
    })
      .then((label) => {
        if (controller.signal.aborted || label === null) return
        setSuggestedTitle(label)
        if (title.trim() === '') {
          setTitle(label)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSuggestedTitle(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSuggestingTitle(false)
        }
      })
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (selectedPoint === null) {
      setFailed(true)
      return
    }

    setFailed(false)
    setBusy(true)
    try {
      const stopId = await addJourneyStop(creatorId, journey.id, null, title)
      await setJourneyStopLocation(
        stopId,
        selectedPoint.latitude,
        selectedPoint.longitude,
      )
      formElement.reset()
      setTitle('')
      setSelectedPoint(null)
      setSuggestedTitle(null)
      onChanged()
      onClose?.()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      {failed ? (
        <p className="text-sm text-destructive" role="alert">
          {t('journey.addError')}
        </p>
      ) : null}

      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-full bg-surface p-2 text-accent">
          <MapPin aria-hidden="true" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{t('journey.addPlace')}</h3>
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-accent">
              <Sparkles aria-hidden="true" className="mr-1 inline" size={12} />
              {t('journey.mapHint')}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t('journey.placeDescription')}
          </p>
        </div>
      </div>

      <Input
        label={t('journey.itemTitle')}
        name="title"
        onChange={(event) => {
          setTitle(event.currentTarget.value)
        }}
        required
        value={title}
      />
      {suggestingTitle ? (
        <p className="text-sm text-muted">
          {t('journey.placeSuggestionLoading')}
        </p>
      ) : suggestedTitle !== null && title.trim() !== '' ? (
        <p className="text-sm text-muted">
          {t('journey.placeSuggestionApplied', { title: suggestedTitle })}
        </p>
      ) : null}

      <LocationPickerMap
        onSelectPoint={handlePointSelected}
        selectedPoint={selectedPoint}
        stops={journey.stops}
      />

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          {selectedPoint === null
            ? t('journey.pickOnMap')
            : t('journey.selectedPoint', {
                latitude: selectedPoint.latitude.toFixed(4),
                longitude: selectedPoint.longitude.toFixed(4),
              })}
        </p>
        <Button
          className="w-full"
          disabled={busy || selectedPoint === null}
          type="submit"
        >
          {t('journey.savePlace')}
        </Button>
      </div>
    </form>
  )
}
