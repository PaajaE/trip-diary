import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import {
  addJourneyStop,
  linkEntryToJourney,
  setJourneyStopLocation,
} from '@/entities/journey/api/journey.repository'
import { z } from 'zod'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import {
  createEntrySchema,
} from '@/entities/entry/model/entry'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { addLocalPhotos } from '@/entities/photo/api/local-photo.repository'
import {
  processPhoto,
  type ProcessedPhoto,
} from '@/entities/photo/lib/process-photo'
import { suggestPlaceLabel } from '@/features/journeys/lib/place-suggestion'
import { LocationPickerMap } from '@/features/journeys/ui/LocationPickerMap'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface CreateJourneyMemoryFormProps {
  creatorId: string
  journey: JourneyDetail
  onCreated: () => void
  spaceId: string
}

const createJourneyMemorySchema = createEntrySchema.extend({
  stageId: z.string(),
})

type CreateJourneyMemoryInput = z.infer<typeof createJourneyMemorySchema>

export function CreateJourneyMemoryForm({
  creatorId,
  journey,
  onCreated,
  spaceId,
}: CreateJourneyMemoryFormProps) {
  const { t, i18n } = useTranslation()
  const [photos, setPhotos] = useState<File[]>([])
  const [detectedPhotos, setDetectedPhotos] = useState<ProcessedPhoto[]>([])
  const [selectedPoint, setSelectedPoint] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [detectingPhotos, setDetectingPhotos] = useState(false)
  const [suggestingTitle, setSuggestingTitle] = useState(false)
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const form = useForm<CreateJourneyMemoryInput>({
    defaultValues: {
      body: '',
      eventAt: new Date().toISOString(),
      language: i18n.language === 'en' ? 'en' : 'cs',
      stageId: journey.stages[0]?.id ?? '',
      title: '',
      type: 'story',
      visibility: 'public',
    },
    resolver: zodResolver(createJourneyMemorySchema),
  })
  const title = form.watch('title')

  useEffect(() => {
    if (selectedPoint === null) {
      setSuggestedTitle(null)
      setSuggestingTitle(false)
      return
    }

    const currentTitle = form.getValues('title').trim()
    if (currentTitle !== '' && currentTitle !== (suggestedTitle ?? '')) {
      setSuggestingTitle(false)
      return
    }

    const controller = new AbortController()
    setSuggestingTitle(true)

    void suggestPlaceLabel({
      language: i18n.language,
      latitude: selectedPoint.latitude,
      longitude: selectedPoint.longitude,
      signal: controller.signal,
    })
      .then((label) => {
        if (controller.signal.aborted || label === null) return
        setSuggestedTitle(label)
        if (form.getValues('title').trim() === '') {
          form.setValue('title', label, { shouldDirty: false })
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

    return () => controller.abort()
  }, [form, i18n.language, selectedPoint, suggestedTitle])

  async function handlePhotoSelection(files: File[]) {
    setPhotos(files)
    setLinkError(null)
    setDetectingPhotos(true)

    try {
      const processed = await Promise.all(
        files.map(async (file) => {
          try {
            return await processPhoto(file)
          } catch {
            return {
              capturedAt: null,
              latitude: null,
              longitude: null,
              variants: [],
            } satisfies ProcessedPhoto
          }
        }),
      )
      setDetectedPhotos(processed)

      const firstCapturedAt = processed.find(
        (photo) => photo.capturedAt !== null,
      )?.capturedAt
      if (firstCapturedAt !== undefined && firstCapturedAt !== null) {
        form.setValue('eventAt', firstCapturedAt, { shouldDirty: true })
      }

      const firstGps = processed.find(
        (photo) => photo.latitude !== null && photo.longitude !== null,
      )
      if (
        firstGps !== undefined &&
        firstGps.latitude !== null &&
        firstGps.longitude !== null
      ) {
        setSelectedPoint({
          latitude: firstGps.latitude,
          longitude: firstGps.longitude,
        })
        setSuggestedTitle(null)
      } else if (files.length > 0) {
        setSelectedPoint(null)
        setSuggestedTitle(null)
      }
    } catch {
      setDetectedPhotos([])
      setSelectedPoint(null)
      setSuggestedTitle(null)
      setLinkError(t('journey.photoInsightsError'))
    } finally {
      setDetectingPhotos(false)
    }
  }

  async function handleSubmit(input: CreateJourneyMemoryInput) {
    setLinkError(null)
    const entry = await createLocalEntry(creatorId, spaceId, {
      body: input.body,
      eventAt: input.eventAt,
      language: input.language,
      title: input.title,
      type: input.type,
      visibility: input.visibility,
    })
    await addLocalPhotos(creatorId, entry.id, photos)

    if (!(await canAutomaticallySync())) {
      setLinkError(t('journey.memoryNeedsConnection'))
      return
    }

    await syncPendingOperations()
    let stopId: string | null = null
    if (selectedPoint !== null && input.stageId !== '') {
      stopId = await addJourneyStop(
        journey.id,
        input.stageId,
        input.title === '' ? t('journey.photoStopFallback') : input.title,
      )
      await setJourneyStopLocation(
        stopId,
        selectedPoint.latitude,
        selectedPoint.longitude,
      )
    }

    await linkEntryToJourney({
      creatorId,
      entryId: entry.id,
      journeyId: journey.id,
      stageId: input.stageId === '' ? null : input.stageId,
      stopId,
    })
    onCreated()
  }

  const photosWithGps = detectedPhotos.filter(
    (photo) => photo.latitude !== null && photo.longitude !== null,
  ).length
  const photosWithTime = detectedPhotos.filter(
    (photo) => photo.capturedAt !== null,
  ).length

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => void form.handleSubmit(handleSubmit)(event)}
    >
      <Input
        error={form.formState.errors.title?.message}
        label={t('entry.title')}
        {...form.register('title')}
      />
      {suggestingTitle ? (
        <p className="text-sm text-muted">{t('journey.placeSuggestionLoading')}</p>
      ) : suggestedTitle !== null && title.trim() !== '' ? (
        <p className="text-sm text-muted">
          {t('journey.placeSuggestionApplied', { title: suggestedTitle })}
        </p>
      ) : null}
      {journey.stages.length === 0 ? null : (
        <label className="block text-sm font-medium">
          {t('journey.stageOptional')}
          <select
            className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3"
            {...form.register('stageId')}
          >
            {journey.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm font-medium">
        {t('entry.body')}
        <textarea
          className="mt-2 min-h-40 w-full rounded-md border border-border bg-surface px-3 py-3 text-base font-normal outline-none focus:border-primary"
          {...form.register('body')}
        />
      </label>
      <label className="block text-sm font-medium">
        {t('entry.photos')}
        <input
          accept="image/*"
          className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-3 text-sm"
          multiple
          onChange={(event) => {
            void handlePhotoSelection(Array.from(event.target.files ?? []))
          }}
          type="file"
        />
        <span className="mt-2 block text-sm font-normal text-muted">
          {t('entry.photosSelected', { count: photos.length })}
        </span>
      </label>
      {photos.length === 0 ? null : (
        <section className="rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {t('journey.photoInsightsTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {detectingPhotos
                  ? t('journey.photoInsightsLoading')
                  : t('journey.photoInsightsSummary', {
                      gps: photosWithGps,
                      time: photosWithTime,
                      total: photos.length,
                    })}
              </p>
            </div>
            {selectedPoint === null ? null : (
              <span className="rounded-full bg-background px-3 py-2 text-xs font-semibold text-accent">
                {t('journey.photoGpsDetected')}
              </span>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <LocationPickerMap
              heightClassName="h-64"
              selectedPoint={selectedPoint}
              setSelectedPoint={setSelectedPoint}
              stops={journey.stops}
            />
            <p className="text-sm text-muted">
              {selectedPoint === null
                ? t('journey.photoGpsMissing')
                : t('journey.selectedPoint', {
                    latitude: selectedPoint.latitude.toFixed(4),
                    longitude: selectedPoint.longitude.toFixed(4),
                  })}
            </p>
          </div>
        </section>
      )}
      {linkError === null ? null : (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {linkError}
        </p>
      )}
      <Button
        className="w-full"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {t('journey.saveMemory')}
      </Button>
    </form>
  )
}
