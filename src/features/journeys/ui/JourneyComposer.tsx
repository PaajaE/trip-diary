import { Link } from '@tanstack/react-router'
import { Camera, FileText, MapPin, Plus, Route, Sparkles } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addJourneyStage,
  addJourneyStop,
  setJourneyStopLocation,
} from '@/entities/journey/api/journey.repository'
import { suggestPlaceLabel } from '@/features/journeys/lib/place-suggestion'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { LocationPickerMap } from '@/features/journeys/ui/LocationPickerMap'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface JourneyComposerProps {
  journey: JourneyDetail
  onChanged: () => void
}

export function JourneyComposer({ journey, onChanged }: JourneyComposerProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(
    event: SyntheticEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<void>,
  ) {
    event.preventDefault()
    const formElement = event.currentTarget
    setFailed(false)
    setBusy(true)
    try {
      await action(new FormData(formElement))
      formElement.reset()
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-t border-border py-12" id="journey-capture">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">
            {t('journey.captureEyebrow')}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            {t('journey.captureTitle')}
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            {t('journey.captureDescription')}
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          params={{ journeyId: journey.id }}
          to="/j/$journeyId/memory/new"
        >
          <Camera aria-hidden="true" size={17} />
          {t('journey.addPhotos')}
        </Link>
      </div>

      {failed ? (
        <p className="mt-6 text-sm text-destructive" role="alert">
          {t('journey.addError')}
        </p>
      ) : null}

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <PlaceCaptureCard
          busy={busy}
          journey={journey}
          onChanged={onChanged}
          onFailed={() => {
            setFailed(true)
          }}
          onStart={() => {
            setFailed(false)
            setBusy(true)
          }}
          onSettled={() => {
            setBusy(false)
          }}
        />

        <div className="space-y-5">
          <ActionCard
            description={t('journey.photoDescription')}
            href="/j/$journeyId/memory/new"
            icon={Camera}
            journeyId={journey.id}
            label={t('journey.addPhotos')}
          />
          <ActionCard
            description={t('journey.noteDescription')}
            href="/j/$journeyId/memory/new"
            icon={FileText}
            journeyId={journey.id}
            label={t('journey.addNote')}
          />
          <form
            className="rounded-[1.25rem] border border-border bg-surface p-5 shadow-soft"
            onSubmit={(event) => {
              void submit(event, async (form) => {
                await addJourneyStage(journey.id, getText(form, 'title'))
              })
            }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-background p-2 text-accent">
                <Route aria-hidden="true" size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold">
                  {t('journey.addStage')}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {t('journey.stageDescription')}
                </p>
                <Input
                  className="mt-4"
                  label={t('journey.stageTitle')}
                  name="title"
                  required
                />
                <Button className="mt-4 w-full" disabled={busy} type="submit">
                  <Plus aria-hidden="true" size={16} />
                  {t('journey.addStageAction')}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}

interface ActionCardProps {
  description: string
  href: '/j/$journeyId/memory/new'
  icon: typeof Camera
  journeyId: string
  label: string
}

function ActionCard({
  description,
  href,
  icon: Icon,
  journeyId,
  label,
}: ActionCardProps) {
  return (
    <Link
      className="block rounded-[1.25rem] border border-border bg-surface p-5 shadow-soft transition-transform hover:-translate-y-0.5 hover:bg-white"
      params={{ journeyId }}
      to={href}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-full bg-background p-2 text-accent">
          <Icon aria-hidden="true" size={18} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{label}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
      </div>
    </Link>
  )
}

interface PlaceCaptureCardProps {
  busy: boolean
  journey: JourneyDetail
  onChanged: () => void
  onFailed: () => void
  onSettled: () => void
  onStart: () => void
}

function PlaceCaptureCard({
  busy,
  journey,
  onChanged,
  onFailed,
  onSettled,
  onStart,
}: PlaceCaptureCardProps) {
  const { t, i18n } = useTranslation()
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
    const form = new FormData(formElement)
    const stageId = getText(form, 'stageId')
    if (selectedPoint === null) {
      onFailed()
      return
    }

    onStart()
    try {
      const stopId = await addJourneyStop(
        journey.id,
        stageId === '' ? (journey.stages[0]?.id ?? '') : stageId,
        title,
      )
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
    } catch {
      onFailed()
    } finally {
      onSettled()
    }
  }

  return (
    <form
      className="rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-full bg-background p-2 text-accent">
          <MapPin aria-hidden="true" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold">{t('journey.addPlace')}</h3>
            <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-accent">
              <Sparkles aria-hidden="true" className="mr-1 inline" size={12} />
              {t('journey.mapHint')}
            </span>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            {t('journey.placeDescription')}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <div>
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
            <p className="mt-2 text-sm text-muted">
              {t('journey.placeSuggestionLoading')}
            </p>
          ) : suggestedTitle !== null && title.trim() !== '' ? (
            <p className="mt-2 text-sm text-muted">
              {t('journey.placeSuggestionApplied', { title: suggestedTitle })}
            </p>
          ) : null}
        </div>

        {journey.stages.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted">
            {t('journey.placeNeedsStage')}
          </p>
        ) : (
          <label className="block text-sm font-medium">
            {t('journey.stageOptional')}
            <select
              className="mt-2 min-h-11 w-full rounded-md border border-border bg-background px-3"
              defaultValue={journey.stages[0]?.id ?? ''}
              name="stageId"
            >
              {journey.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <LocationPickerMap
          onSelectPoint={handlePointSelected}
          selectedPoint={selectedPoint}
          stops={journey.stops}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {selectedPoint === null
              ? t('journey.pickOnMap')
              : t('journey.selectedPoint', {
                  latitude: selectedPoint.latitude.toFixed(4),
                  longitude: selectedPoint.longitude.toFixed(4),
                })}
          </p>
          <Button
            className="sm:min-w-44"
            disabled={
              busy || journey.stages.length === 0 || selectedPoint === null
            }
            type="submit"
          >
            {t('journey.savePlace')}
          </Button>
        </div>
      </div>
    </form>
  )
}

function getText(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}
