import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createNatureObservation } from '@/entities/nature/api/observation-mutation.repository'
import { spotNatureGoal } from '@/entities/nature/api/spot-nature-goal.repository'
import type {
  ChecklistItemCategory,
  JourneyChecklistItem,
} from '@/entities/checklist/model/checklist'
import {
  fetchNearbyInaturalistSpecies,
  type InaturalistTaxonMatch,
} from '@/entities/nature/lib/inaturalist'
import { getPhotoCoordinates } from '@/entities/photo/api/photo-gallery.repository'
import { isBrowserOnline } from '@/shared/lib/network'
import { cn } from '@/shared/lib/cn'

interface PhotoIdentifySuggestionsProps {
  checklistItems: JourneyChecklistItem[]
  className?: string
  creatorId: string
  entryId?: string
  journeyId: string
  latitude?: number | null
  longitude?: number | null
  onChanged?: () => void
  onSpotted?: () => void
  photoId: string
  tone?: 'default' | 'inverse'
}

export function PhotoIdentifySuggestions({
  checklistItems,
  className,
  creatorId,
  entryId,
  journeyId,
  latitude = null,
  longitude = null,
  onChanged,
  onSpotted,
  photoId,
  tone = 'inverse',
}: PhotoIdentifySuggestionsProps) {
  const { t } = useTranslation()
  const inverse = tone === 'inverse'
  const [loading, setLoading] = useState(false)
  const [savingTaxonId, setSavingTaxonId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<InaturalistTaxonMatch[]>([])

  if (!isBrowserOnline()) {
    return null
  }

  async function resolveCoordinates(): Promise<{
    latitude: number
    longitude: number
  } | null> {
    const photoCoords = await getPhotoCoordinates(photoId)
    const resolvedLatitude = photoCoords?.latitude ?? latitude
    const resolvedLongitude = photoCoords?.longitude ?? longitude
    if (
      resolvedLatitude == null ||
      resolvedLongitude == null ||
      !Number.isFinite(resolvedLatitude) ||
      !Number.isFinite(resolvedLongitude)
    ) {
      return null
    }

    return {
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
    }
  }

  async function handleIdentify() {
    setLoading(true)
    setError(null)
    try {
      const coordinates = await resolveCoordinates()
      if (coordinates === null) {
        setError(t('nature.identify.needsLocation'))
        return
      }

      const nextSuggestions = await fetchNearbyInaturalistSpecies({
        latitude: coordinates.latitude,
        limit: 8,
        longitude: coordinates.longitude,
      })

      if (nextSuggestions.length === 0) {
        setError(t('nature.identify.unavailable'))
        return
      }

      setSuggestions(nextSuggestions)
    } catch {
      setError(t('nature.identify.failed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(suggestion: InaturalistTaxonMatch) {
    setSavingTaxonId(suggestion.taxonId)
    try {
      const coordinates = await resolveCoordinates()

      const normalizedCommon = suggestion.commonName.trim().toLowerCase()
      const normalizedScientific = suggestion.scientificName
        .trim()
        .toLowerCase()
      const matchedGoal = checklistItems.find((item) => {
        const title = item.title.trim().toLowerCase()
        const notes = item.notes.trim().toLowerCase()
        return (
          title === normalizedCommon ||
          title.includes(normalizedCommon) ||
          notes === normalizedScientific ||
          notes.includes(normalizedScientific)
        )
      })

      if (matchedGoal !== undefined) {
        await spotNatureGoal({
          creatorId,
          ...(entryId !== undefined ? { entryId } : {}),
          item: matchedGoal,
          journeyId,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          photoId,
        })
      } else {
        await createNatureObservation({
          category: categoryForSuggestion(suggestion),
          commonName: suggestion.commonName,
          confidence: 'unsure',
          creatorId,
          entryId: entryId ?? null,
          externalId: String(suggestion.taxonId),
          externalSource: 'inaturalist',
          journeyId,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          photoId,
          scientificName: suggestion.scientificName,
        })
      }

      setSuggestions([])
      onChanged?.()
      onSpotted?.()
    } finally {
      setSavingTaxonId(null)
    }
  }

  return (
    <div
      className={cn(
        'flex w-full max-w-xl flex-col items-center gap-2',
        className,
      )}
    >
      {suggestions.length === 0 ? (
        <>
          <button
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50',
              inverse
                ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                : 'border-border/80 bg-background/50 text-foreground hover:bg-background',
            )}
            disabled={loading}
            onClick={() => {
              void handleIdentify()
            }}
            type="button"
          >
            <Sparkles aria-hidden="true" size={14} />
            {loading
              ? t('nature.identify.loading')
              : t('nature.identify.action')}
          </button>
          {error === null ? null : (
            <p
              className={cn(
                'text-xs',
                inverse ? 'text-white/70' : 'text-muted',
              )}
            >
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p
            className={cn('text-xs', inverse ? 'text-white/70' : 'text-muted')}
          >
            {t('nature.identify.hint')}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                className={cn(
                  'inline-flex max-w-xs flex-col items-start rounded-full border px-3 py-1.5 text-left text-sm transition disabled:opacity-50',
                  inverse
                    ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                    : 'border-border/80 bg-background/50 text-foreground hover:bg-background',
                )}
                disabled={savingTaxonId !== null}
                key={suggestion.taxonId}
                onClick={() => {
                  void handleSelect(suggestion)
                }}
                type="button"
              >
                <span>{suggestion.commonName}</span>
                <span
                  className={cn(
                    'text-xs italic',
                    inverse ? 'text-white/70' : 'text-muted',
                  )}
                >
                  {suggestion.scientificName}
                </span>
              </button>
            ))}
          </div>
          <p
            className={cn('text-xs', inverse ? 'text-white/70' : 'text-muted')}
          >
            {t('nature.inaturalistAttribution')}
          </p>
        </>
      )}
    </div>
  )
}

function categoryForSuggestion(
  suggestion: InaturalistTaxonMatch,
): ChecklistItemCategory {
  if (
    suggestion.iconicTaxon === 'Plantae' ||
    suggestion.iconicTaxon === 'Fungi'
  ) {
    return 'flora'
  }

  return 'wildlife'
}
