import { useQuery } from '@tanstack/react-query'
import { Images, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { listJourneyPhotoTags } from '@/entities/photo/api/photo-tag.repository'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import type { JourneyPhotoTag } from '@/entities/photo/model/photo-tag'
import type { NatureObservation } from '@/entities/nature/model/observation'
import {
  observationCategoryForTagSlug,
  observationsForCollectionTag,
  uniqueSpeciesNames,
} from '@/features/journeys/lib/collection-observations'
import { cn } from '@/shared/lib/cn'

interface JourneyTagCollectionsProps {
  journeyId: string
  observations?: NatureObservation[]
  onSelectTag: (slug: string) => void
  selectedTagSlug: string | null
}

export function JourneyTagCollections({
  journeyId,
  observations = [],
  onSelectTag,
  selectedTagSlug,
}: JourneyTagCollectionsProps) {
  const { t } = useTranslation()
  const tagsQuery = useQuery({
    queryFn: () => listJourneyPhotoTags(journeyId),
    queryKey: photoQueryKeys.journeyTags(journeyId),
  })

  if (tagsQuery.isPending) {
    return (
      <p className="mt-8 text-sm text-muted" role="status">
        {t('reader.collectionsLoading')}
      </p>
    )
  }

  if (tagsQuery.isError) {
    return (
      <p className="mt-8 text-sm text-destructive" role="alert">
        {t('reader.collectionsError')}
      </p>
    )
  }

  const tags = tagsQuery.data
  if (tags.length === 0) {
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-6 text-muted">
        {t('reader.collectionsEmpty')}
      </p>
    )
  }

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      {tags.map((tag) => (
        <CollectionCard
          active={selectedTagSlug === tag.slug}
          key={tag.id}
          observations={observations}
          onSelect={() => {
            onSelectTag(tag.slug)
          }}
          tag={tag}
        />
      ))}
    </div>
  )
}

function CollectionCard({
  active,
  observations,
  onSelect,
  tag,
}: {
  active: boolean
  observations: NatureObservation[]
  onSelect: () => void
  tag: JourneyPhotoTag
}) {
  const { t } = useTranslation()
  const speciesCount =
    observationCategoryForTagSlug(tag.slug) === null
      ? 0
      : uniqueSpeciesNames(observationsForCollectionTag(observations, tag.slug))
          .length

  return (
    <button
      className={cn(
        'rounded-2xl border p-5 text-left shadow-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active
          ? 'border-primary bg-primary/5'
          : 'border-border bg-surface hover:bg-white',
      )}
      onClick={onSelect}
      type="button"
    >
      <p className="text-lg font-semibold">{tag.label}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted">
        {speciesCount > 0 ? (
          <span>{t('reader.collectionSpecies', { count: speciesCount })}</span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <Images aria-hidden="true" size={15} />
          {t('reader.collectionPhotos', { count: tag.photoCount })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin aria-hidden="true" size={15} />
          {t('reader.collectionMapHint')}
        </span>
      </div>
    </button>
  )
}
