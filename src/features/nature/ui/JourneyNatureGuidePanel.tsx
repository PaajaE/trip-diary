import { useQuery } from '@tanstack/react-query'
import { BookOpen, Leaf } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CHECKLIST_TEMPLATES } from '@/entities/checklist/data/templates'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import {
  fetchRegionalSpecies,
  fetchWikipediaSummary,
} from '@/entities/nature/api/nature-guide.repository'
import type { NatureObservation } from '@/entities/nature/model/observation'
import { cn } from '@/shared/lib/cn'

interface JourneyNatureGuidePanelProps {
  checklistItems: JourneyChecklistItem[]
  className?: string
  journeyId: string
  observations: NatureObservation[]
}

function templateCenter(templateSlug: string | null): {
  latitude: number
  longitude: number
} | null {
  if (templateSlug === null) {
    return null
  }

  const template = CHECKLIST_TEMPLATES.find(
    (item) => item.slug === templateSlug,
  )
  const located = template?.items.find(
    (item) => item.latitude !== undefined && item.longitude !== undefined,
  )
  if (located?.latitude === undefined || located.longitude === undefined) {
    return null
  }

  return {
    latitude: located.latitude,
    longitude: located.longitude,
  }
}

export function JourneyNatureGuidePanel({
  checklistItems,
  className,
  journeyId,
  observations,
}: JourneyNatureGuidePanelProps) {
  const { t } = useTranslation()
  const templateSlug = checklistItems[0]?.templateSlug ?? null
  const center = templateCenter(templateSlug)

  const regionalQuery = useQuery({
    enabled: center !== null,
    queryFn: () =>
      fetchRegionalSpecies({
        latitude: center?.latitude ?? 0,
        longitude: center?.longitude ?? 0,
      }),
    queryKey: [
      'nature-guide-regional',
      journeyId,
      center?.latitude,
      center?.longitude,
    ],
  })

  const topSpecies = regionalQuery.data?.[0]
  const wikiQuery = useQuery({
    enabled: topSpecies !== undefined,
    queryFn: () => fetchWikipediaSummary(topSpecies?.commonName ?? ''),
    queryKey: ['nature-guide-wiki', topSpecies?.commonName],
  })

  return (
    <section
      className={cn(
        'rounded-2xl border border-border bg-surface p-5',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Leaf aria-hidden="true" className="text-accent" size={18} />
        <h3 className="text-lg font-semibold">{t('natureGuide.title')}</h3>
      </div>
      <p className="mt-2 text-sm text-muted">{t('natureGuide.description')}</p>

      {observations.length > 0 ? (
        <div className="mt-6">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {t('natureGuide.yourObservations')}
          </h4>
          <ul className="mt-3 space-y-2">
            {observations.slice(0, 6).map((observation) => (
              <li
                className="rounded-xl border border-border bg-background/60 px-4 py-3"
                key={observation.id}
              >
                <p className="font-semibold">{observation.commonName}</p>
                {observation.scientificName === null ? null : (
                  <p className="text-sm italic text-muted">
                    {observation.scientificName}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {center === null ? (
        <p className="mt-6 text-sm text-muted">
          {t('natureGuide.needsChecklist')}
        </p>
      ) : null}

      {regionalQuery.isPending && center !== null ? (
        <p className="mt-6 text-sm text-muted">{t('natureGuide.loading')}</p>
      ) : null}

      {regionalQuery.isError ? (
        <p className="mt-6 text-sm text-muted">
          {t('natureGuide.offlineHint')}
        </p>
      ) : null}

      {regionalQuery.data !== undefined && regionalQuery.data.length > 0 ? (
        <div className="mt-6">
          <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <BookOpen aria-hidden="true" size={15} />
            {t('natureGuide.nearbySpecies')}
          </h4>
          <ul className="mt-3 space-y-2">
            {regionalQuery.data.map((species) => (
              <li
                className="rounded-xl border border-border bg-background/60 px-4 py-3"
                key={species.taxonKey}
              >
                <p className="font-semibold">{species.commonName}</p>
                {species.scientificName === null ? null : (
                  <p className="text-sm italic text-muted">
                    {species.scientificName}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {t('natureGuide.gbifOccurrences', {
                    count: species.occurrenceCount,
                  })}
                </p>
              </li>
            ))}
          </ul>
          {wikiQuery.data !== null && wikiQuery.data !== undefined ? (
            <p className="mt-4 text-sm leading-6 text-muted">
              {wikiQuery.data}
            </p>
          ) : null}
          <p className="mt-4 text-xs text-muted">
            {t('natureGuide.attribution')}
          </p>
        </div>
      ) : null}
    </section>
  )
}
