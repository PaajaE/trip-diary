import { useTranslation } from 'react-i18next'
import type { WikidataEntry } from '@/entities/nature/lib/wikidata'
import type { RegionalSpecies } from '@/entities/nature/model/observation'
import { ExportToINaturalistLink } from '@/features/nature/ui/ExportToINaturalistLink'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'
import { Button } from '@/shared/ui/Button'

interface SpeciesDetailSheetProps {
  canAddToGoals: boolean
  latitude?: number | null
  longitude?: number | null
  onAddToGoals?: (species: RegionalSpecies) => void
  onClose: () => void
  open: boolean
  species: RegionalSpecies | null
  wikiSummary?: string | null
  wikidataEntry?: WikidataEntry | null
}

export function SpeciesDetailSheet({
  canAddToGoals,
  latitude = null,
  longitude = null,
  onAddToGoals,
  onClose,
  open,
  species,
  wikiSummary = null,
  wikidataEntry = null,
}: SpeciesDetailSheetProps) {
  const { t } = useTranslation()

  if (species === null) {
    return null
  }

  return (
    <SoftBottomSheet
      closeLabel={t('nature.strip.close')}
      onClose={onClose}
      open={open}
      title={species.commonName}
    >
      {species.scientificName === null ? null : (
        <p className="text-sm italic text-muted">{species.scientificName}</p>
      )}
      {wikidataEntry === null ? null : (
        <p className="mt-2 text-sm text-muted">
          {wikidataEntry.description ?? wikidataEntry.label}
        </p>
      )}
      <p className="mt-2 text-sm text-muted">
        {t('natureGuide.gbifOccurrences', {
          count: species.occurrenceCount,
        })}
      </p>
      {wikiSummary === null || wikiSummary === '' ? null : (
        <p className="mt-4 text-sm leading-6 text-muted">{wikiSummary}</p>
      )}
      <div className="mt-4">
        <ExportToINaturalistLink
          commonName={species.commonName}
          latitude={latitude}
          longitude={longitude}
          scientificName={species.scientificName}
        />
      </div>
      {canAddToGoals && onAddToGoals !== undefined ? (
        <Button
          className="mt-5 w-full"
          onClick={() => {
            onAddToGoals(species)
            onClose()
          }}
        >
          {t('natureGuide.addToGoals')}
        </Button>
      ) : null}
    </SoftBottomSheet>
  )
}
