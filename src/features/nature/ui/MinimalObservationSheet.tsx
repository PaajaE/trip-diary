import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createNatureObservation } from '@/entities/nature/api/observation-mutation.repository'
import type { ChecklistItemCategory } from '@/entities/checklist/model/checklist'
import { TaxonNameSuggest } from '@/features/nature/ui/TaxonNameSuggest'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'

interface MinimalObservationSheetProps {
  category?: ChecklistItemCategory
  creatorId: string
  entryId?: string | null
  journeyId: string
  latitude?: number | null
  longitude?: number | null
  onChanged?: () => void
  onClose: () => void
  onSaved?: () => void
  open: boolean
  photoId?: string | null
}

export function MinimalObservationSheet({
  category = 'wildlife',
  creatorId,
  entryId = null,
  journeyId,
  latitude = null,
  longitude = null,
  onChanged,
  onClose,
  onSaved,
  open,
  photoId = null,
}: MinimalObservationSheetProps) {
  const { t } = useTranslation()
  const [commonName, setCommonName] = useState('')
  const [scientificName, setScientificName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const trimmed = commonName.trim()
    if (trimmed === '') {
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createNatureObservation({
        category,
        commonName: trimmed,
        confidence: 'seen',
        creatorId,
        entryId,
        journeyId,
        latitude,
        longitude,
        notes: '',
        photoId,
        scientificName,
      })
      setCommonName('')
      setScientificName(null)
      onChanged?.()
      onSaved?.()
      onClose()
    } catch {
      setError(t('observation.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SoftBottomSheet
      closeLabel={t('nature.strip.close')}
      onClose={onClose}
      open={open}
      title={t('observation.logTitle')}
    >
      <p className="text-sm text-muted">{t('nature.match.otherHint')}</p>
      <TaxonNameSuggest
        className="mt-4"
        inputClassName="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary/40"
        onChange={setCommonName}
        onSelectTaxon={(taxon) => {
          setScientificName(taxon.scientificName)
        }}
        placeholder={t('observation.commonNamePlaceholder')}
        value={commonName}
      />
      {error !== null ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        disabled={saving || commonName.trim() === ''}
        onClick={() => {
          void handleSave()
        }}
        type="button"
      >
        {saving ? t('observation.saving') : t('observation.save')}
      </button>
    </SoftBottomSheet>
  )
}
