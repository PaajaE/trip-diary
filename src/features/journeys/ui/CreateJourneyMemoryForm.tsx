import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, MapPin } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { saveLocalJourneyLink } from '@/entities/journey/api/local-journey-link.repository'
import { z } from 'zod'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { createEntrySchema } from '@/entities/entry/model/entry'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { addLocalPhotos } from '@/entities/photo/api/local-photo.repository'
import {
  processPhoto,
  type ProcessedPhoto,
  type SelectedPhotoFile,
} from '@/entities/photo/lib/process-photo'
import {
  choosePhotosFromFiles,
  choosePhotosFromGallery,
  createSelectedPhotos,
  supportsFileSystemPhotoSelection,
  supportsNativePhotoSelection,
} from '@/entities/photo/lib/photo-selection'
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
  const [photos, setPhotos] = useState<SelectedPhotoFile[]>([])
  const [detectedPhotos, setDetectedPhotos] = useState<ProcessedPhoto[]>([])
  const [selectedPoint, setSelectedPoint] = useState<{
    latitude: number
    longitude: number
  } | null>(null)
  const [detectingPhotos, setDetectingPhotos] = useState(false)
  const [suggestingTitle, setSuggestingTitle] = useState(false)
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [locatingUser, setLocatingUser] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const title = useWatch({ control: form.control, name: 'title' })

  function handlePointSelected(point: { latitude: number; longitude: number }) {
    setSelectedPoint(point)
    const currentTitle = form.getValues('title').trim()
    if (currentTitle !== '' && currentTitle !== (suggestedTitle ?? '')) {
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
  }

  async function handlePhotoSelection(files: SelectedPhotoFile[]) {
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

      const firstGps = processed.find(hasValidGpsPoint)
      if (firstGps !== undefined) {
        handlePointSelected({
          latitude: firstGps.latitude,
          longitude: firstGps.longitude,
        })
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

  async function handleNativePhotoSelection() {
    setLinkError(null)

    try {
      await handlePhotoSelection(await choosePhotosFromGallery())
    } catch {
      setDetectedPhotos([])
      setSelectedPoint(null)
      setSuggestedTitle(null)
      setLinkError(t('entry.photoPickerError'))
    }
  }

  async function handleFileSystemPhotoSelection() {
    setLinkError(null)
    setDetectingPhotos(true)

    try {
      await handlePhotoSelection(await choosePhotosFromFiles())
    } catch {
      setDetectingPhotos(false)
      fileInputRef.current?.click()
    }
  }

  async function handleUseCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setLinkError(t('journey.currentLocationUnavailable'))
      return
    }

    setLinkError(null)
    setLocatingUser(true)

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 120000,
            timeout: 12000,
          })
        },
      )
      handlePointSelected({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      })
    } catch {
      setLinkError(t('journey.currentLocationFailed'))
    } finally {
      setLocatingUser(false)
    }
  }

  const isNativePlatform = supportsNativePhotoSelection()
  const supportsFileSystemPicker = supportsFileSystemPhotoSelection()

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

    const stopId = selectedPoint === null ? null : crypto.randomUUID()

    await saveLocalJourneyLink({
      creatorId,
      entryId: entry.id,
      journeyId: journey.id,
      latitude: selectedPoint?.latitude ?? null,
      locationTitle:
        selectedPoint === null
          ? null
          : input.title === ''
            ? t('journey.photoStopFallback')
            : input.title,
      longitude: selectedPoint?.longitude ?? null,
      stageId: input.stageId === '' ? null : input.stageId,
      stopId,
    })
    onCreated()

    if (await canAutomaticallySync()) {
      void syncPendingOperations().catch(() => {
        // The local moment remains visible and can be synced again later.
      })
    }
  }

  const photosWithGps = detectedPhotos.filter(hasValidGpsPoint).length
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
        <p className="text-sm text-muted">
          {t('journey.placeSuggestionLoading')}
        </p>
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
        {isNativePlatform ? (
          <div className="mt-3 space-y-3">
            <Button
              className="w-full"
              disabled={detectingPhotos || form.formState.isSubmitting}
              onClick={() => void handleNativePhotoSelection()}
              type="button"
              variant="secondary"
            >
              <Camera aria-hidden="true" size={18} />
              {detectingPhotos
                ? t('entry.photoPickerLoading')
                : t('entry.photoPickerAction')}
            </Button>
            <span className="block text-sm font-normal text-muted">
              {t('entry.photoPickerHint')}
            </span>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {supportsFileSystemPicker ? (
              <Button
                className="w-full"
                disabled={detectingPhotos || form.formState.isSubmitting}
                onClick={() => void handleFileSystemPhotoSelection()}
                type="button"
                variant="secondary"
              >
                <Camera aria-hidden="true" size={18} />
                {detectingPhotos
                  ? t('entry.filePickerLoading')
                  : t('entry.filePickerAction')}
              </Button>
            ) : null}
            <input
              accept="image/*"
              className="block w-full rounded-md border border-border bg-surface px-3 py-3 text-sm"
              multiple
              onChange={(event) => {
                void handlePhotoSelection(
                  createSelectedPhotos(Array.from(event.target.files ?? [])),
                )
              }}
              ref={fileInputRef}
              type="file"
            />
            <span className="block text-sm font-normal text-muted">
              {supportsFileSystemPicker
                ? t('entry.filePickerHint')
                : t('entry.filePickerFallbackHint')}
            </span>
          </div>
        )}
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
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={locatingUser}
                onClick={() => void handleUseCurrentLocation()}
                type="button"
                variant="secondary"
              >
                <MapPin aria-hidden="true" size={16} />
                {locatingUser
                  ? t('journey.currentLocationLoading')
                  : t('journey.useCurrentLocation')}
              </Button>
            </div>
            <LocationPickerMap
              heightClassName="h-64"
              onSelectPoint={handlePointSelected}
              selectedPoint={selectedPoint}
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

function hasValidGpsPoint(
  photo: Pick<ProcessedPhoto, 'latitude' | 'longitude'>,
): photo is ProcessedPhoto & { latitude: number; longitude: number } {
  return isFiniteLatitude(photo.latitude) && isFiniteLongitude(photo.longitude)
}

function isFiniteLatitude(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && Math.abs(value) <= 90
}

function isFiniteLongitude(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && Math.abs(value) <= 180
}
