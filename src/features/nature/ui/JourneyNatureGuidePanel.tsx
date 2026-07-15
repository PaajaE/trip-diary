import { useQuery } from '@tanstack/react-query'
import { BookOpen, ChevronDown, Leaf, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CHECKLIST_TEMPLATES } from '@/entities/checklist/data/templates'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import {
  fetchRegionalSpecies,
  fetchWikipediaSummary,
} from '@/entities/nature/api/nature-guide.repository'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
import { fetchWikidataEntry } from '@/entities/nature/lib/wikidata'
import type {
  NatureObservation,
  RegionalSpecies,
} from '@/entities/nature/model/observation'
import {
  bboxCenter,
  computeJourneyBbox,
} from '@/entities/nature/lib/journey-bbox'
import { createCustomChecklistItem } from '@/entities/checklist/api/checklist-mutation.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { SpeciesDetailSheet } from '@/features/nature/ui/SpeciesDetailSheet'
import { ExportToINaturalistLink } from '@/features/nature/ui/ExportToINaturalistLink'
import { cn } from '@/shared/lib/cn'
import { isBrowserOnline } from '@/shared/lib/network'

interface JourneyNatureGuidePanelProps {
  checklistItems: JourneyChecklistItem[]
  className?: string
  compact?: boolean
  creatorId?: string
  journeyId: string
  moments?: JourneyMoment[]
  observations: NatureObservation[]
  onSpeciesAdded?: () => void
  plannedStops?: JourneyDetail['stops']
  showAddToGoals?: boolean
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
  compact = false,
  creatorId,
  journeyId,
  moments = [],
  observations,
  onSpeciesAdded,
  plannedStops = [],
  showAddToGoals = false,
}: JourneyNatureGuidePanelProps) {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(!compact)
  const [activeSpecies, setActiveSpecies] = useState<RegionalSpecies | null>(
    null,
  )
  const templateSlug = checklistItems[0]?.templateSlug ?? null
  const templateFallback = templateCenter(templateSlug)
  const bbox = computeJourneyBbox({
    checklistItems,
    moments,
    stops: plannedStops,
    ...(templateFallback !== null ? { templateCenter: templateFallback } : {}),
  })
  const center = bbox === null ? templateFallback : bboxCenter(bbox)

  const regionalQuery = useQuery({
    enabled: center !== null,
    queryFn: () =>
      fetchRegionalSpecies({
        ...(bbox !== null ? { bbox } : {}),
        journeyId,
        latitude: center?.latitude ?? 0,
        limit: compact ? 3 : 12,
        longitude: center?.longitude ?? 0,
      }),
    queryKey: natureQueryKeys.regionalGuide(journeyId, bbox),
  })

  const wikiQuery = useQuery({
    enabled: activeSpecies !== null,
    queryFn: () =>
      fetchWikipediaSummary(activeSpecies?.commonName ?? '', i18n.language),
    queryKey: natureQueryKeys.wiki(activeSpecies?.commonName, i18n.language),
  })

  const wikidataQuery = useQuery({
    enabled: activeSpecies !== null,
    queryFn: () =>
      fetchWikidataEntry(
        activeSpecies?.scientificName ?? activeSpecies?.commonName ?? '',
        i18n.language,
      ),
    queryKey: natureQueryKeys.wikidata(
      activeSpecies?.scientificName,
      activeSpecies?.commonName,
      i18n.language,
    ),
  })

  const online = isBrowserOnline()
  const previewSpecies = (regionalQuery.data ?? []).slice(0, compact ? 3 : 12)

  function handleAddSpecies(species: RegionalSpecies) {
    if (creatorId === undefined) {
      return
    }
    void createCustomChecklistItem({
      category: 'wildlife',
      creatorId,
      journeyId,
      notes: species.scientificName ?? '',
      title: species.commonName,
    }).then(() => {
      onSpeciesAdded?.()
    })
  }

  return (
    <section
      className={cn(
        compact
          ? 'rounded-2xl bg-background/40'
          : 'rounded-2xl border border-border bg-surface p-5',
        className,
      )}
    >
      <button
        className="flex w-full items-start justify-between gap-3 px-1 py-1 text-left"
        onClick={() => {
          setOpen((current) => !current)
        }}
        type="button"
      >
        <div>
          <div className="flex items-center gap-2">
            <Leaf aria-hidden="true" className="text-accent" size={18} />
            <h3
              className={
                compact ? 'text-base font-medium' : 'text-lg font-semibold'
              }
            >
              {t('natureGuide.title')}
            </h3>
            {online ? (
              <Wifi aria-hidden="true" className="text-muted" size={14} />
            ) : (
              <WifiOff aria-hidden="true" className="text-muted" size={14} />
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {t('natureGuide.description')}
          </p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'mt-1 size-5 shrink-0 text-muted transition-transform',
            open ? 'rotate-180' : '',
          )}
        />
      </button>

      {open ? (
        <div className={compact ? 'mt-3' : 'mt-4'}>
          {center === null ? (
            <p className="text-sm text-muted">
              {t('natureGuide.needsChecklist')}
            </p>
          ) : null}

          {regionalQuery.isPending && center !== null ? (
            <p className="mt-3 text-sm text-muted">
              {t('natureGuide.loading')}
            </p>
          ) : null}

          {regionalQuery.isError ? (
            <p className="mt-3 text-sm text-muted">
              {t('natureGuide.offlineHint')}
            </p>
          ) : null}

          {previewSpecies.length > 0 ? (
            <div className="mt-3">
              <h4 className="flex items-center gap-2 text-sm font-medium text-muted">
                <BookOpen aria-hidden="true" size={15} />
                {t('natureGuide.nearbySpecies')}
              </h4>
              <ul className="mt-2 space-y-2">
                {previewSpecies.map((species) => (
                  <li key={species.taxonKey}>
                    <button
                      className="w-full rounded-xl bg-background/70 px-4 py-3 text-left transition hover:bg-background"
                      onClick={() => {
                        setActiveSpecies(species)
                      }}
                      type="button"
                    >
                      <p className="font-medium">{species.commonName}</p>
                      {species.scientificName === null ? null : (
                        <p className="text-sm italic text-muted">
                          {species.scientificName}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                {t('natureGuide.attribution')}
              </p>
            </div>
          ) : null}

          {!compact && observations.length > 0 ? (
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
                    <ExportToINaturalistLink
                      className="mt-2"
                      commonName={observation.commonName}
                      latitude={observation.latitude}
                      longitude={observation.longitude}
                      scientificName={observation.scientificName}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <SpeciesDetailSheet
        canAddToGoals={showAddToGoals && creatorId !== undefined}
        latitude={center?.latitude ?? null}
        longitude={center?.longitude ?? null}
        {...(creatorId !== undefined ? { onAddToGoals: handleAddSpecies } : {})}
        onClose={() => {
          setActiveSpecies(null)
        }}
        open={activeSpecies !== null}
        species={activeSpecies}
        {...(wikiQuery.data !== undefined && wikiQuery.data !== null
          ? { wikiSummary: wikiQuery.data }
          : {})}
        {...(wikidataQuery.data !== undefined && wikidataQuery.data !== null
          ? { wikidataEntry: wikidataQuery.data }
          : {})}
      />
    </section>
  )
}
