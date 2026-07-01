import { useTranslation } from 'react-i18next'
import type { RegionalSpecies } from '@/entities/nature/model/observation'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'
import { Button } from '@/shared/ui/Button'

interface SpeciesDetailSheetProps {
  canAddToGoals: boolean
  onAddToGoals?: (species: RegionalSpecies) => void
  onClose: () => void
  open: boolean
  species: RegionalSpecies | null
  wikiSummary?: string | null
}

export function SpeciesDetailSheet({
  canAddToGoals,
  onAddToGoals,
  onClose,
  open,
  species,
  wikiSummary = null,
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
      <p className="mt-2 text-sm text-muted">
        {t('natureGuide.gbifOccurrences', {
          count: species.occurrenceCount,
        })}
      </p>
      {wikiSummary === null || wikiSummary === '' ? null : (
        <p className="mt-4 text-sm leading-6 text-muted">{wikiSummary}</p>
      )}
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
