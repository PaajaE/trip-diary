import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Camera, Plus, Star } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addPhotosToEntry,
  reorderEntryPhotos,
} from '@/entities/photo/api/entry-photo-mutations.repository'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import {
  coverObjectPositionStyle,
  focalFromPreview,
} from '@/entities/photo/lib/cover-focal-point'
import {
  choosePhotosFromFiles,
  choosePhotosFromGallery,
  createSelectedPhotos,
  supportsFileSystemPhotoSelection,
  supportsNativePhotoSelection,
  WEB_PHOTO_VIDEO_ACCEPT,
} from '@/entities/photo/lib/photo-selection'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { MomentMediaSheet } from '@/features/photos/ui/MomentMediaSheet'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { getSupabaseClient } from '@/shared/api/supabase'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/use-toast'
import { cn } from '@/shared/lib/cn'

interface MomentMediaEditorProps {
  alt: string
  creatorId: string
  entryId: string
  journeyId?: string
  onPhotosChanged: () => void
  photos: PhotoPreview[]
}

export function MomentMediaEditor({
  alt,
  creatorId,
  entryId,
  journeyId,
  onPhotosChanged,
  photos,
}: MomentMediaEditorProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const urls = usePhotoObjectUrls(photos)
  const isNativePlatform = supportsNativePhotoSelection()
  const supportsFileSystemPicker = supportsFileSystemPhotoSelection()

  const captionsQuery = useQuery({
    enabled: photos.length > 0,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from('entry_photos')
        .select('photo_id, caption')
        .eq('entry_id', entryId)
      if (error !== null) {
        throw error
      }
      return new Map(
        data.map((row) => [
          row.photo_id,
          typeof row.caption === 'string' ? row.caption : '',
        ]),
      )
    },
    queryKey: [...entryQueryKeys.detail(entryId), 'captions'],
  })

  const addMutation = useMutation({
    mutationFn: (files: ReturnType<typeof createSelectedPhotos>) =>
      addPhotosToEntry(creatorId, entryId, files),
    onError: () => {
      showToast({ message: t('entry.photoUploadFailed'), variant: 'error' })
    },
    onSuccess: async () => {
      await invalidatePhotos()
      onPhotosChanged()
      showToast({ message: t('entry.photosAdded'), variant: 'default' })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (orderedPhotoIds: string[]) =>
      reorderEntryPhotos(entryId, creatorId, orderedPhotoIds),
    onError: () => {
      showToast({ message: t('entry.photoReorderFailed'), variant: 'error' })
    },
    onSuccess: async () => {
      await invalidatePhotos()
      onPhotosChanged()
    },
  })

  async function invalidatePhotos() {
    if (journeyId !== undefined) {
      await queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.detail(journeyId),
      })
    }
    await queryClient.invalidateQueries({
      queryKey: entryQueryKeys.photoPreviews(entryId),
    })
    await queryClient.invalidateQueries({
      queryKey: entryQueryKeys.photoViewPreviews(entryId),
    })
    await queryClient.invalidateQueries({
      queryKey: entryQueryKeys.publicMomentPhotos(entryId),
    })
  }

  async function handleAddFiles(files: File[]) {
    if (files.length === 0) {
      return
    }
    setAdding(true)
    try {
      await addMutation.mutateAsync(createSelectedPhotos(files))
    } finally {
      setAdding(false)
    }
  }

  async function handleNativeAdd() {
    setAdding(true)
    try {
      await addMutation.mutateAsync(await choosePhotosFromGallery())
    } catch {
      showToast({ message: t('entry.photoPickerError'), variant: 'error' })
    } finally {
      setAdding(false)
    }
  }

  async function handleFileSystemAdd() {
    setAdding(true)
    try {
      await addMutation.mutateAsync(await choosePhotosFromFiles())
    } catch {
      showToast({ message: t('entry.filePickerLoading'), variant: 'error' })
    } finally {
      setAdding(false)
    }
  }

  function movePhoto(photoId: string, direction: -1 | 1) {
    const ids = photos.map((photo) => photo.id)
    const index = ids.indexOf(photoId)
    if (index < 0) {
      return
    }
    const target = index + direction
    if (target < 0 || target >= ids.length) {
      return
    }
    const next = [...ids]
    const current = next[index]
    const swap = next[target]
    if (current === undefined || swap === undefined) {
      return
    }
    next[index] = swap
    next[target] = current
    reorderMutation.mutate(next)
  }

  const coverId =
    photos.find((photo) => photo.isCover === true)?.id ?? photos[0]?.id ?? null
  const activePhoto =
    activePhotoId === null
      ? null
      : (photos.find((photo) => photo.id === activePhotoId) ?? null)
  const activeUrl =
    activePhotoId === null
      ? null
      : (urls.find((preview) => preview.id === activePhotoId) ?? null)

  return (
    <section aria-label={t('entry.mediaSectionTitle', { count: photos.length })}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="reader-display text-2xl tracking-[-0.03em]">
          {t('reader.photosHeading')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {isNativePlatform ? (
            <Button
              className="min-h-10 px-3 text-sm"
              disabled={adding || addMutation.isPending}
              onClick={() => {
                void handleNativeAdd()
              }}
              type="button"
              variant="secondary"
            >
              <Camera aria-hidden="true" size={16} />
              {t('entry.addMediaAction')}
            </Button>
          ) : (
            <>
              {supportsFileSystemPicker ? (
                <Button
                  className="min-h-10 px-3 text-sm"
                  disabled={adding || addMutation.isPending}
                  onClick={() => {
                    void handleFileSystemAdd()
                  }}
                  type="button"
                  variant="secondary"
                >
                  <Plus aria-hidden="true" size={16} />
                  {t('entry.addMediaAction')}
                </Button>
              ) : null}
              <Button
                className="min-h-10 px-3 text-sm"
                disabled={adding || addMutation.isPending}
                onClick={() => {
                  fileInputRef.current?.click()
                }}
                type="button"
                variant="secondary"
              >
                <Plus aria-hidden="true" size={16} />
                {supportsFileSystemPicker
                  ? t('entry.addMediaFallback')
                  : t('entry.addMediaAction')}
              </Button>
              <input
                accept={WEB_PHOTO_VIDEO_ACCEPT}
                className="sr-only"
                multiple
                onChange={(event) => {
                  void handleAddFiles(Array.from(event.target.files ?? []))
                  event.target.value = ''
                }}
                ref={fileInputRef}
                type="file"
              />
            </>
          )}
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 px-5 py-10 text-center text-sm text-muted">
          {t('entry.mediaEmptyEdit')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          {urls.map((preview, index) => {
            const meta = photos.find((photo) => photo.id === preview.id)
            if (meta === undefined) {
              return null
            }
            const isCover = preview.id === coverId
            const focalStyle = isCover
              ? coverObjectPositionStyle(focalFromPreview(meta), '50% 50%')
              : undefined
            return (
              <div className="group relative" key={preview.id}>
                <button
                  aria-label={`${alt} ${String(index + 1)}`}
                  className={cn(
                    'block w-full overflow-hidden rounded-xl focus-visible:outline-offset-2',
                    isCover && 'ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
                  )}
                  onClick={() => {
                    setActivePhotoId(preview.id)
                  }}
                  type="button"
                >
                  <ResponsivePhotoImage
                    alt=""
                    className="aspect-square w-full object-cover"
                    decorative
                    sizes={GALLERY_GRID_SIZES}
                    src={preview.url}
                    {...(focalStyle === undefined ? {} : { style: focalStyle })}
                  />
                  {meta.mediaType === 'video' ? <VideoPlayOverlay /> : null}
                </button>

                {isCover ? (
                  <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    <Star aria-hidden="true" className="size-3 fill-current" />
                    {t('entry.coverPhoto')}
                  </span>
                ) : null}

                <div className="absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button
                    aria-label={t('entry.movePhotoEarlier')}
                    className="inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-40"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={(event) => {
                      event.stopPropagation()
                      movePhoto(preview.id, -1)
                    }}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" size={14} />
                  </button>
                  <button
                    aria-label={t('entry.movePhotoLater')}
                    className="inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-40"
                    disabled={
                      index === photos.length - 1 || reorderMutation.isPending
                    }
                    onClick={(event) => {
                      event.stopPropagation()
                      movePhoto(preview.id, 1)
                    }}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activePhoto !== null && activeUrl !== null ? (
        <MomentMediaSheet
          alt={alt}
          caption={captionsQuery.data?.get(activePhoto.id) ?? ''}
          creatorId={creatorId}
          entryId={entryId}
          isCover={activePhoto.id === coverId}
          onClose={() => {
            setActivePhotoId(null)
          }}
          onCoverChanged={() => {
            void invalidatePhotos().then(onPhotosChanged)
          }}
          onRemoved={() => {
            setActivePhotoId(null)
            void invalidatePhotos().then(onPhotosChanged)
          }}
          open={activePhotoId !== null}
          photo={activePhoto}
          previewUrl={activeUrl.url}
        />
      ) : null}
    </section>
  )
}
