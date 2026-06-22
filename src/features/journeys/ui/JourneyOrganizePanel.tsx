import { ChevronDown, MapPin, Plus, Route, Sparkles } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addJourneyStage,
  addJourneyStop,
  deleteJourneyStage,
  setJourneyStopLocation,
  updateJourneyStage,
} from '@/entities/journey/api/journey.repository'
import {
  deleteJourney,
  updateJourney,
} from '@/entities/journey/api/journey-mutation.repository'
import { suggestPlaceLabel } from '@/features/journeys/lib/place-suggestion'
import type { JourneyDetail, JourneyStage } from '@/entities/journey/model/journey'
import { LocationPickerMap } from '@/features/journeys/ui/LocationPickerMap'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'
import { cn } from '@/shared/lib/cn'

interface JourneyOrganizePanelProps {
  canManageJourney?: boolean
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  onDeleted?: () => void
}

export function JourneyOrganizePanel({
  canManageJourney = false,
  creatorId,
  journey,
  onChanged,
  onDeleted,
}: JourneyOrganizePanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
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
    <section className="mt-10 rounded-[1.5rem] border border-border bg-surface shadow-soft">
      <button
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
        onClick={() => {
          setOpen((current) => !current)
        }}
        type="button"
      >
        <div>
          <p className="text-sm font-semibold text-accent">
            {t('journey.organizeEyebrow')}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {t('journey.organizeTitle')}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {t('journey.organizeDescription')}
          </p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-5 shrink-0 text-muted transition-transform',
            open ? 'rotate-180' : '',
          )}
        />
      </button>

      {open ? (
        <div className="space-y-5 border-t border-border px-5 py-5 sm:px-6">
          {failed ? (
            <p className="text-sm text-destructive" role="alert">
              {t('journey.addError')}
            </p>
          ) : null}

          <form
            className="rounded-[1.25rem] border border-border bg-background/70 p-5"
            onSubmit={(event) => {
              void submit(event, async (form) => {
                await updateJourney(journey.id, creatorId, {
                  endsAt: journey.endsAt,
                  startsAt: journey.startsAt,
                  summary: getText(form, 'summary'),
                  title: getText(form, 'title'),
                })
              })
            }}
          >
            <h3 className="text-lg font-semibold">{t('journey.editTrip')}</h3>
            <Input
              className="mt-4"
              defaultValue={journey.title}
              label={t('journey.itemTitle')}
              name="title"
              required
            />
            <label className="mt-4 block text-sm font-medium">
              {t('journey.summary')}
              <textarea
                className="mt-2 min-h-24 w-full rounded-md border border-border bg-surface px-3 py-3 text-base"
                defaultValue={journey.summary}
                name="summary"
              />
            </label>
            <Button className="mt-4 w-full" disabled={busy} type="submit">
              {t('journey.saveTrip')}
            </Button>
          </form>

          {canManageJourney ? (
            <div className="rounded-[1.25rem] border border-destructive/20 bg-destructive/5 p-5">
              <h3 className="text-lg font-semibold text-destructive">
                {t('journey.deleteTrip')}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {t('journey.deleteTripDescription')}
              </p>
              <Button
                className="mt-4 w-full"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t('journey.deleteTripConfirm'))) {
                    return
                  }
                  setFailed(false)
                  setBusy(true)
                  void deleteJourney(journey.id, creatorId)
                    .then(() => {
                      onDeleted?.()
                    })
                    .catch(() => {
                      setFailed(true)
                    })
                    .finally(() => {
                      setBusy(false)
                    })
                }}
                type="button"
                variant="secondary"
              >
                {t('journey.deleteTripAction')}
              </Button>
            </div>
          ) : null}

          <form
            className="rounded-[1.25rem] border border-border bg-background/70 p-5"
            onSubmit={(event) => {
              void submit(event, async (form) => {
                await addJourneyStage(
                  creatorId,
                  journey.id,
                  getText(form, 'title'),
                )
              })
            }}
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-surface p-2 text-accent">
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

          {journey.stages.length > 0 ? (
            <div className="rounded-[1.25rem] border border-border bg-background/70 p-5">
              <h3 className="text-lg font-semibold">
                {t('journey.manageStages')}
              </h3>
              <div className="mt-4 space-y-4">
                {journey.stages.map((stage) => (
                  <StageEditForm
                    busy={busy}
                    creatorId={creatorId}
                    journeyId={journey.id}
                    key={stage.id}
                    onChanged={onChanged}
                    onFailed={() => {
                      setFailed(true)
                    }}
                    onSubmit={submit}
                    stage={stage}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <PlaceCaptureCard
            busy={busy}
            creatorId={creatorId}
            journey={journey}
            onChanged={onChanged}
            onFailed={() => {
              setFailed(true)
            }}
            onSettled={() => {
              setBusy(false)
            }}
            onStart={() => {
              setFailed(false)
              setBusy(true)
            }}
          />
        </div>
      ) : null}
    </section>
  )
}

interface PlaceCaptureCardProps {
  busy: boolean
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  onFailed: () => void
  onSettled: () => void
  onStart: () => void
}

function PlaceCaptureCard({
  busy,
  creatorId,
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
        creatorId,
        journey.id,
        stageId === '' ? null : stageId,
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
      className="rounded-[1.25rem] border border-border bg-background/70 p-5"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
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

      <div className="mt-5 grid gap-5">
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

        <label className="block text-sm font-medium">
          {t('journey.stageOptional')}
          <select
            className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base"
            defaultValue=""
            name="stageId"
          >
            <option value="">{t('journey.noStage')}</option>
            {journey.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-sm font-normal text-muted">
            {t('journey.stageOptionalHint')}
          </span>
        </label>

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
      </div>
    </form>
  )
}

function getText(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

interface StageEditFormProps {
  busy: boolean
  creatorId: string
  journeyId: string
  onChanged: () => void
  onFailed: () => void
  onSubmit: (
    event: SyntheticEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<void>,
  ) => Promise<void>
  stage: JourneyStage
}

function StageEditForm({
  busy,
  creatorId,
  journeyId,
  onChanged,
  onFailed,
  onSubmit,
  stage,
}: StageEditFormProps) {
  const { t } = useTranslation()

  return (
    <form
      className="rounded-xl border border-border bg-surface p-4"
      onSubmit={(event) => {
        void onSubmit(event, async (form) => {
          await updateJourneyStage(creatorId, journeyId, stage.id, {
            summary: getText(form, 'summary'),
            title: getText(form, 'title'),
          })
        })
      }}
    >
      <Input
        defaultValue={stage.title}
        label={t('journey.stageTitle')}
        name="title"
        required
      />
      <label className="mt-4 block text-sm font-medium">
        {t('journey.stageSummary')}
        <textarea
          className="mt-2 min-h-20 w-full rounded-md border border-border bg-background px-3 py-3 text-base"
          defaultValue={stage.summary}
          name="summary"
        />
      </label>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" disabled={busy} type="submit">
          {t('journey.saveStage')}
        </Button>
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(t('journey.deleteStageConfirm'))) {
              return
            }
            void deleteJourneyStage(creatorId, journeyId, stage.id)
              .then(onChanged)
              .catch(onFailed)
          }}
          type="button"
          variant="secondary"
        >
          {t('journey.deleteStageAction')}
        </Button>
      </div>
    </form>
  )
}
