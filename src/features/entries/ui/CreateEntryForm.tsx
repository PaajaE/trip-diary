import { zodResolver } from '@hookform/resolvers/zod'
import { Camera } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { addLocalPhotos } from '@/entities/photo/api/local-photo.repository'
import {
  createEntrySchema,
  type CreateEntryInput,
} from '@/entities/entry/model/entry'
import {
  choosePhotosFromGallery,
  createSelectedPhotos,
  supportsNativePhotoSelection,
} from '@/entities/photo/lib/photo-selection'
import type { SelectedPhotoFile } from '@/entities/photo/lib/process-photo'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

interface CreateEntryFormProps {
  creatorId: string
  onCreated: (entryId: string) => void
  spaceId: string
}

export function CreateEntryForm({
  creatorId,
  onCreated,
  spaceId,
}: CreateEntryFormProps) {
  const { t, i18n } = useTranslation()
  const [photos, setPhotos] = useState<SelectedPhotoFile[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [pickingPhotos, setPickingPhotos] = useState(false)
  const form = useForm<CreateEntryInput>({
    resolver: zodResolver(createEntrySchema),
    defaultValues: {
      body: '',
      eventAt: new Date().toISOString(),
      language: i18n.language === 'en' ? 'en' : 'cs',
      title: '',
      type: 'story',
      visibility: 'public',
    },
  })

  async function handleSubmit(input: CreateEntryInput) {
    const entry = await createLocalEntry(creatorId, spaceId, input)
    await addLocalPhotos(creatorId, entry.id, photos)
    try {
      if (await canAutomaticallySync()) {
        await syncPendingOperations()
      }
    } catch {
      // The local draft is safe and can be synchronized later.
    }
    onCreated(entry.id)
  }

  async function handleNativePhotoSelection() {
    setPhotoError(null)
    setPickingPhotos(true)

    try {
      setPhotos(await choosePhotosFromGallery())
    } catch {
      setPhotoError(t('entry.photoPickerError'))
    } finally {
      setPickingPhotos(false)
    }
  }

  const isNativePlatform = supportsNativePhotoSelection()

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
              disabled={pickingPhotos}
              onClick={() => void handleNativePhotoSelection()}
              type="button"
              variant="secondary"
            >
              <Camera aria-hidden="true" size={18} />
              {pickingPhotos
                ? t('entry.photoPickerLoading')
                : t('entry.photoPickerAction')}
            </Button>
            <span className="block text-sm font-normal text-muted">
              {t('entry.photoPickerHint')}
            </span>
          </div>
        ) : (
          <input
            accept="image/*"
            className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-3 text-sm"
            multiple
            onChange={(event) => {
              setPhotoError(null)
              setPhotos(
                createSelectedPhotos(Array.from(event.target.files ?? [])),
              )
            }}
            type="file"
          />
        )}
        <span className="mt-2 block text-sm font-normal text-muted">
          {t('entry.photosSelected', { count: photos.length })}
        </span>
        {photoError === null ? null : (
          <span className="mt-2 block text-sm font-normal text-destructive">
            {photoError}
          </span>
        )}
      </label>
      <Button
        className="w-full"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {t('entry.publish')}
      </Button>
    </form>
  )
}
