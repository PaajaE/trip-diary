import type { TFunction } from 'i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'
import {
  getJourneyStageContentKey,
  getJourneyStageContentLabel,
  shouldShowJourneyStageHeader,
} from '@/features/journeys/lib/journey-stage-label'

export interface PublicGalleryImage {
  entryId: string
  eventAt: string | null
  id: string
  momentTitle: string | null
  preview: PhotoPreview
  sortIndex: number
  stageGroupKey: string
}

export interface PublicGalleryGroup {
  imageIds: string[]
  key: string
  label: string | null
}

export interface PublicJourneyGallery {
  flatImages: PublicGalleryImage[]
  groups: PublicGalleryGroup[]
}

export const MIN_IMAGES_FOR_DAY_GROUP_HEADER = 2

export function buildPublicJourneyGallery(input: {
  locale: string
  minImagesForDayHeader?: number
  photosByEntryId: Map<string, PhotoPreview[]>
  stageContents: JourneyStageContent[]
  t: TFunction
}): PublicJourneyGallery {
  const minImagesForDayHeader =
    input.minImagesForDayHeader ?? MIN_IMAGES_FOR_DAY_GROUP_HEADER
  const seenPhotoIds = new Set<string>()
  const flatImages: PublicGalleryImage[] = []
  let sortIndex = 0

  for (const stageContent of input.stageContents) {
    for (const moment of stageContent.moments) {
      const photos = input.photosByEntryId.get(moment.entry.id) ?? []
      for (const preview of photos) {
        if (seenPhotoIds.has(preview.id)) {
          continue
        }
        seenPhotoIds.add(preview.id)
        flatImages.push({
          entryId: moment.entry.id,
          eventAt: moment.entry.eventAt,
          id: preview.id,
          momentTitle: moment.entry.title,
          preview,
          sortIndex,
          stageGroupKey: getJourneyStageContentKey(stageContent),
        })
        sortIndex += 1
      }
    }
  }

  const hasExplicitStages = input.stageContents.some(
    (content) => content.stage !== null,
  )
  const groups: PublicGalleryGroup[] = []

  for (const stageContent of input.stageContents) {
    const groupImages = flatImages.filter(
      (image) => image.stageGroupKey === getJourneyStageContentKey(stageContent),
    )
    if (groupImages.length === 0) {
      continue
    }

    const label = resolvePublicGalleryGroupLabel({
      groupImageCount: groupImages.length,
      hasExplicitStages,
      locale: input.locale,
      minImagesForDayHeader,
      stageContent,
      t: input.t,
    })

    groups.push({
      imageIds: groupImages.map((image) => image.id),
      key: getJourneyStageContentKey(stageContent),
      label,
    })
  }

  if (groups.length === 0 && flatImages.length > 0) {
    groups.push({
      imageIds: flatImages.map((image) => image.id),
      key: 'all',
      label: null,
    })
  }

  return {
    flatImages,
    groups: groups.filter((group) => group.imageIds.length > 0),
  }
}

export function resolvePublicGalleryGroupLabel(input: {
  groupImageCount: number
  hasExplicitStages: boolean
  locale: string
  minImagesForDayHeader: number
  stageContent: JourneyStageContent
  t: TFunction
}): string | null {
  if (input.hasExplicitStages) {
    if (input.stageContent.stage === null) {
      return input.groupImageCount >= input.minImagesForDayHeader &&
        shouldShowJourneyStageHeader(input.stageContent)
        ? getJourneyStageContentLabel(
            input.stageContent,
            input.t,
            input.locale,
          )
        : null
    }

    return getJourneyStageContentLabel(
      input.stageContent,
      input.t,
      input.locale,
    )
  }

  if (
    input.groupImageCount >= input.minImagesForDayHeader &&
    shouldShowJourneyStageHeader(input.stageContent)
  ) {
    return getJourneyStageContentLabel(
      input.stageContent,
      input.t,
      input.locale,
    )
  }

  return null
}

export function getPublicGalleryImageAlt(
  image: PublicGalleryImage,
  t: TFunction,
): string {
  if (image.momentTitle !== null && image.momentTitle.trim() !== '') {
    return image.momentTitle
  }

  return t('journey.galleryUntitled')
}

export function getPublicGalleryImageIndex(
  gallery: PublicJourneyGallery,
  photoId: string,
): number {
  return gallery.flatImages.findIndex((image) => image.id === photoId)
}

export function getPublicGalleryImageById(
  gallery: PublicJourneyGallery,
  photoId: string,
): PublicGalleryImage | undefined {
  return gallery.flatImages.find((image) => image.id === photoId)
}

export function publicGalleryImagesToLightboxItems(
  images: PublicGalleryImage[],
  resolveUrl: (image: PublicGalleryImage) => string | undefined,
  t: TFunction,
) {
  return images.flatMap((image) => {
    const thumbUrl = resolveUrl(image)
    if (thumbUrl === undefined) {
      return []
    }

    return [
      {
        alt: getPublicGalleryImageAlt(image, t),
        entryId: image.entryId,
        id: image.id,
        thumbUrl,
      },
    ]
  })
}
