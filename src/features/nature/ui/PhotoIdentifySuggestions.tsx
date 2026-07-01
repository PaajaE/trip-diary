import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { identifyPhotoViaEdge } from '@/entities/nature/api/nature-edge.repository'
import { createNatureObservation } from '@/entities/nature/api/observation-mutation.repository'
import { spotNatureGoal } from '@/entities/nature/api/spot-nature-goal.repository'
import type {
  ChecklistItemCategory,
  JourneyChecklistItem,
} from '@/entities/checklist/model/checklist'
import type { PhotoIdentifySuggestion } from '@/entities/nature/lib/gbif-regional-species'
import { prepareIdentifyImage } from '@/entities/nature/lib/prepare-identify-image'
import {
  getPhotoCoordinates,
  getPhotoDetailPreview,
} from '@/entities/photo/api/photo-gallery.repository'
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
}: PhotoIdentifySuggestionsProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [savingTaxonId, setSavingTaxonId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<PhotoIdentifySuggestion[]>([])

  if (!isBrowserOnline()) {
    return null
  }

  async function handleIdentify() {
    setLoading(true)
    setError(null)
    try {
      const preview = await getPhotoDetailPreview(photoId)
      if (preview === null) {
        setError(t('nature.identify.unavailable'))
        return
      }

      const prepared = await prepareIdentifyImage(preview.blob)
      const photoCoords = await getPhotoCoordinates(photoId)
      const nextSuggestions = await identifyPhotoViaEdge({
        imageBase64: prepared.imageBase64,
        latitude: photoCoords?.latitude ?? latitude,
        longitude: photoCoords?.longitude ?? longitude,
        mimeType: prepared.mimeType,
      })

      if (nextSuggestions === null || nextSuggestions.length === 0) {
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

  async function handleSelect(suggestion: PhotoIdentifySuggestion) {
    setSavingTaxonId(suggestion.taxonId)
    try {
      const photoCoords = await getPhotoCoordinates(photoId)
      const resolvedLatitude = photoCoords?.latitude ?? latitude
      const resolvedLongitude = photoCoords?.longitude ?? longitude

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
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
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
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
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
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20 disabled:opacity-50"
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
            <p className="text-xs text-white/70">{error}</p>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-white/70">{t('nature.identify.hint')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                className="inline-flex max-w-xs flex-col items-start rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-left text-sm text-white transition hover:bg-white/20 disabled:opacity-50"
                disabled={savingTaxonId !== null}
                key={suggestion.taxonId}
                onClick={() => {
                  void handleSelect(suggestion)
                }}
                type="button"
              >
                <span>{suggestion.commonName}</span>
                <span className="text-xs italic text-white/70">
                  {suggestion.scientificName}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-white/60">
            {t('nature.inaturalistAttribution')}
          </p>
        </>
      )}
    </div>
  )
}

function categoryForSuggestion(
  suggestion: PhotoIdentifySuggestion,
): ChecklistItemCategory {
  if (
    suggestion.iconicTaxon === 'Plantae' ||
    suggestion.iconicTaxon === 'Fungi'
  ) {
    return 'flora'
  }

  return 'wildlife'
}
