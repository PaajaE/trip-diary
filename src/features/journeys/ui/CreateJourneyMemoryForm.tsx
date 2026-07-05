import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, MapPin } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { saveLocalJourneyLink } from '@/entities/journey/api/local-journey-link.repository'
import { z } from 'zod'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { createEntrySchema } from '@/entities/entry/model/entry'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { addLocalPhotos } from '@/entities/photo/api/local-photo.repository'
import {
  processPhoto,
  type ProcessedPhoto,
  type SelectedPhotoFile,
} from '@/entities/photo/lib/process-photo'
import { isMeaningfulGpsCoordinate } from '@/entities/photo/lib/photo-exif-gps'
import {
  choosePhotosFromFiles,
  choosePhotosFromGallery,
  createSelectedPhotos,
  supportsFileSystemPhotoSelection,
  supportsNativePhotoSelection,
} from '@/entities/photo/lib/photo-selection'
import { useMemoryPhotoPreviews } from '@/features/journeys/lib/use-memory-photo-previews'
import {
  clearJourneyMemoryPhotoDraft,
  getJourneyMemoryPhotoDraft,
  setJourneyMemoryPhotoDraft,
} from '@/features/journeys/lib/journey-memory-photo-draft'
import { suggestPlaceLabel } from '@/features/journeys/lib/place-suggestion'
import { LocationPickerMap } from '@/features/journeys/ui/LocationPickerMap'
import {
  getCurrentDevicePosition,
  isGeolocationAvailable,
} from '@/shared/lib/geolocation'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { createPublicSlug } from '@/shared/lib/slug'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface CreateJourneyMemoryFormProps {
  creatorId: string
  journey: JourneyDetail
  natureGoal?: Pick<JourneyChecklistItem, 'id' | 'title'>
  noteFieldRef?: RefObject<HTMLTextAreaElement | null>
  onCreated: (meta: {
    body: string
    entryId: string
    entrySlug: string
    entryTitle: string
    eventAt: string
    photoIds: string[]
    photosFailed?: boolean
    type: CreateJourneyMemoryInput['type']
  }) => void
  spaceId: string
}

const createJourneyMemorySchema = createEntrySchema
  .omit({ title: true })
  .extend({
    title: z.string().max(160),
  })

type CreateJourneyMemoryInput = z.infer<typeof createJourneyMemorySchema>

export function CreateJourneyMemoryForm({
  creatorId,
  journey,
  natureGoal,
  noteFieldRef,
  onCreated,
  spaceId,
}: CreateJourneyMemoryFormProps) {
  const { t, i18n } = useTranslation()
  const restoredDraft = getJourneyMemoryPhotoDraft(journey.id)
  const [photos, setPhotos] = useState<SelectedPhotoFile[]>(
    () => restoredDraft?.photos ?? [],
  )
  const [detectedPhotos, setDetectedPhotos] = useState<ProcessedPhoto[]>(
    () => restoredDraft?.detectedPhotos ?? [],
  )
  const [selectedPoint, setSelectedPoint] = useState<{
    latitude: number
    longitude: number
  } | null>(() => restoredDraft?.selectedPoint ?? null)
  const [locationSource, setLocationSource] = useState<
    'current' | 'map' | 'photo' | null
  >(() => restoredDraft?.locationSource ?? null)
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
      title: '',
      type: 'story',
      visibility: 'public',
    },
    resolver: zodResolver(createJourneyMemorySchema),
  })
  const title = useWatch({ control: form.control, name: 'title' })
  const photoPreviewUrls = useMemoryPhotoPreviews(photos, detectedPhotos)

  useEffect(() => {
    if (natureGoal === undefined) {
      return
    }

    if (form.getValues('title').trim() === '') {
      form.setValue('title', natureGoal.title, { shouldDirty: false })
    }
  }, [form, natureGoal])

  function persistPhotoDraft(next: {
    detectedPhotos?: ProcessedPhoto[]
    locationSource?: 'current' | 'map' | 'photo' | null
    photos?: SelectedPhotoFile[]
    selectedPoint?: { latitude: number; longitude: number } | null
  }) {
    const draft = {
      detectedPhotos: next.detectedPhotos ?? detectedPhotos,
      locationSource: next.locationSource ?? locationSource,
      photos: next.photos ?? photos,
      selectedPoint: next.selectedPoint ?? selectedPoint,
    }

    setJourneyMemoryPhotoDraft(journey.id, draft)
  }

  function handlePointSelected(
    point: { latitude: number; longitude: number },
    source: 'current' | 'map' | 'photo' = 'map',
  ) {
    setSelectedPoint(point)
    setLocationSource(source)
    if (photos.length > 0) {
      setJourneyMemoryPhotoDraft(journey.id, {
        detectedPhotos,
        locationSource: source,
        photos,
        selectedPoint: point,
      })
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
    setDetectedPhotos([])
    setSelectedPoint(null)
    setLocationSource(null)
    setSuggestedTitle(null)
    setLinkError(null)
    setDetectingPhotos(true)
    persistPhotoDraft({
      detectedPhotos: [],
      locationSource: null,
      photos: files,
      selectedPoint: null,
    })

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
      let nextSelectedPoint: { latitude: number; longitude: number } | null =
        null
      let nextLocationSource: 'current' | 'map' | 'photo' | null = null

      if (firstGps !== undefined) {
        nextSelectedPoint = {
          latitude: firstGps.latitude,
          longitude: firstGps.longitude,
        }
        nextLocationSource = 'photo'
        handlePointSelected(nextSelectedPoint, 'photo')
      } else if (files.length > 0) {
        setSelectedPoint(null)
        setLocationSource(null)
        setSuggestedTitle(null)
      }

      persistPhotoDraft({
        detectedPhotos: processed,
        locationSource: nextLocationSource,
        photos: files,
        selectedPoint: nextSelectedPoint,
      })
    } catch (error) {
      setDetectedPhotos([])
      setSelectedPoint(null)
      setLocationSource(null)
      setSuggestedTitle(null)
      setLinkError(
        `${t('journey.photoInsightsError')} (${formatPhotoError(error)})`,
      )
    } finally {
      setDetectingPhotos(false)
    }
  }

  async function handleNativePhotoSelection() {
    setLinkError(null)

    try {
      await handlePhotoSelection(await choosePhotosFromGallery())
    } catch (error) {
      setDetectedPhotos([])
      setSelectedPoint(null)
      setSuggestedTitle(null)
      setLinkError(
        `${t('entry.photoPickerError')} (${formatPhotoError(error)})`,
      )
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
    if (!isGeolocationAvailable()) {
      setLinkError(t('journey.currentLocationUnavailable'))
      return
    }

    setLinkError(null)
    setLocatingUser(true)

    try {
      const position = await getCurrentDevicePosition({
        enableHighAccuracy: true,
        maximumAge: 120_000,
        timeout: 12_000,
      })
      handlePointSelected(position, 'current')
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
    const resolvedTitle =
      [input.title.trim(), suggestedTitle?.trim() ?? ''].find(
        (value) => value !== '',
      ) ?? t('journey.photoStopFallback')

    const entry = await createLocalEntry(creatorId, spaceId, {
      body: input.body,
      eventAt: input.eventAt,
      language: input.language,
      title: resolvedTitle,
      type: input.type,
      visibility: input.visibility,
    })

    const stopId = selectedPoint === null ? null : crypto.randomUUID()

    await saveLocalJourneyLink({
      creatorId,
      entryId: entry.id,
      journeyId: journey.id,
      latitude: selectedPoint?.latitude ?? null,
      locationTitle:
        selectedPoint === null
          ? null
          : resolvedTitle === ''
            ? t('journey.photoStopFallback')
            : resolvedTitle,
      longitude: selectedPoint?.longitude ?? null,
      stageId: null,
      stopId,
    })

    let photosFailed = false
    let photoIds: string[] = []
    try {
      photoIds =
        photos.length > 0
          ? await addLocalPhotos(creatorId, entry.id, photos, detectedPhotos)
          : []
    } catch {
      // Keep the moment in the journey even if photo processing fails.
      setLinkError(t('journey.photoProcessingFailed'))
      photosFailed = true
    }
    onCreated({
      body: input.body,
      entryId: entry.id,
      entrySlug: entry.slug ?? createPublicSlug(resolvedTitle, entry.id),
      entryTitle: resolvedTitle,
      eventAt: input.eventAt,
      photoIds,
      photosFailed,
      type: input.type,
    })
    clearJourneyMemoryPhotoDraft(journey.id)

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
      <label className="block text-sm font-medium">
        {t('entry.body')}
        <textarea
          className="mt-2 min-h-40 w-full rounded-md border border-border bg-surface px-3 py-3 text-base font-normal outline-none focus:border-primary"
          {...(() => {
            const { ref, ...bodyField } = form.register('body')
            return {
              ...bodyField,
              ref: (element: HTMLTextAreaElement | null) => {
                ref(element)
                if (noteFieldRef !== undefined) {
                  noteFieldRef.current = element
                }
              },
            }
          })()}
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
            {locationSource === null ? null : (
              <span className="rounded-full bg-background px-3 py-2 text-xs font-semibold text-accent">
                {t(`journey.locationSource.${locationSource}`)}
              </span>
            )}
          </div>

          <div className="mt-5 space-y-4">
            {photoPreviewUrls.length === 0 ? (
              detectingPhotos ? (
                <div
                  className="grid grid-cols-3 gap-2 sm:grid-cols-5"
                  role="status"
                >
                  {photos.map((photo, index) => (
                    <div
                      aria-hidden="true"
                      className="aspect-square w-full animate-pulse rounded-xl bg-background"
                      key={`${photo.file.name}-${String(index)}`}
                    />
                  ))}
                </div>
              ) : null
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photoPreviewUrls.map((preview) => (
                  <img
                    alt=""
                    className="aspect-square w-full rounded-xl object-cover"
                    key={preview.id}
                    src={preview.url}
                  />
                ))}
              </div>
            )}
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
      {form.formState.errors.eventAt?.message === undefined ? null : (
        <p className="text-sm text-destructive">
          {form.formState.errors.eventAt.message}
        </p>
      )}
      <Button
        className="w-full"
        disabled={detectingPhotos || form.formState.isSubmitting}
        type="submit"
      >
        {form.formState.isSubmitting
          ? t('journey.savingMemory')
          : t('journey.saveMemory')}
      </Button>
    </form>
  )
}

function hasValidGpsPoint(
  photo: Pick<ProcessedPhoto, 'latitude' | 'longitude'>,
): photo is ProcessedPhoto & { latitude: number; longitude: number } {
  return isMeaningfulGpsCoordinate(photo.latitude, photo.longitude)
}

function formatPhotoError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown error'
}
