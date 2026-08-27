import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Plus, Star } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addPhotosToEntry } from '@/entities/photo/api/entry-photo-mutations.repository'
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
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { MomentMediaSheet } from '@/features/photos/ui/MomentMediaSheet'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { MOMENT_EDIT_GRID_SIZES } from '@/features/journeys/ui/moment-editorial-layout'
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
    await queryClient.invalidateQueries({
      queryKey: [...entryQueryKeys.detail(entryId), 'captions'],
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
    <section
      aria-label={t('entry.mediaSectionTitle', { count: photos.length })}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/30 pb-3">
        <h2 className="reader-display text-2xl tracking-[-0.03em]">
          {t('entry.photosEditHeading', { count: photos.length })}
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
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-5">
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
              <div className="relative" key={preview.id}>
                <button
                  aria-label={`${alt} ${String(index + 1)}`}
                  className={cn(
                    'block w-full overflow-hidden rounded-xl transition hover:opacity-95 focus-visible:outline-offset-2',
                    isCover &&
                      'ring-2 ring-primary/30 ring-offset-2 ring-offset-background',
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
                    sizes={MOMENT_EDIT_GRID_SIZES}
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
