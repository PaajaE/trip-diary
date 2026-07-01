import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createNatureObservation } from '@/entities/nature/api/observation-mutation.repository'
import type {
  NatureObservation,
  ObservationConfidence,
} from '@/entities/nature/model/observation'
import type { ChecklistItemCategory } from '@/entities/checklist/model/checklist'

interface ObservationLogFormProps {
  category?: ChecklistItemCategory
  creatorId: string
  journeyId: string
  latitude?: number | null
  longitude?: number | null
  onChanged?: () => void
  onSaved?: (observation: NatureObservation) => void
  photoId?: string
}

export function ObservationLogForm({
  category = 'wildlife',
  creatorId,
  journeyId,
  latitude = null,
  longitude = null,
  onChanged,
  onSaved,
  photoId,
}: ObservationLogFormProps) {
  const { t } = useTranslation()
  const [commonName, setCommonName] = useState('')
  const [scientificName, setScientificName] = useState('')
  const [confidence, setConfidence] = useState<ObservationConfidence>('seen')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const trimmed = commonName.trim()
    if (trimmed === '') {
      return
    }

    setSaving(true)
    setError(null)
    try {
      const observation = await createNatureObservation({
        category,
        commonName: trimmed,
        confidence,
        creatorId,
        journeyId,
        latitude,
        longitude,
        notes,
        photoId: photoId ?? null,
        scientificName:
          scientificName.trim() === '' ? null : scientificName.trim(),
      })
      setCommonName('')
      setScientificName('')
      setNotes('')
      onSaved?.(observation)
      onChanged?.()
    } catch {
      setError(t('observation.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 w-full max-w-md rounded-xl border border-white/20 bg-black/30 p-3 text-left text-white">
      <p className="text-sm font-semibold">{t('observation.logTitle')}</p>
      <div className="mt-3 space-y-2">
        <input
          className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/50"
          onChange={(event) => {
            setCommonName(event.target.value)
          }}
          placeholder={t('observation.commonNamePlaceholder')}
          value={commonName}
        />
        <input
          className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/50"
          onChange={(event) => {
            setScientificName(event.target.value)
          }}
          placeholder={t('observation.scientificNamePlaceholder')}
          value={scientificName}
        />
        <select
          className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white"
          onChange={(event) => {
            setConfidence(event.target.value as ObservationConfidence)
          }}
          value={confidence}
        >
          <option value="seen">{t('observation.confidence.seen')}</option>
          <option value="heard">{t('observation.confidence.heard')}</option>
          <option value="unsure">{t('observation.confidence.unsure')}</option>
        </select>
        <textarea
          className="min-h-16 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/50"
          onChange={(event) => {
            setNotes(event.target.value)
          }}
          placeholder={t('observation.notesPlaceholder')}
          value={notes}
        />
      </div>
      {error !== null ? (
        <p className="mt-2 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50"
        disabled={saving || commonName.trim() === ''}
        onClick={() => {
          void handleSubmit()
        }}
        type="button"
      >
        {saving ? t('observation.saving') : t('observation.save')}
      </button>
    </div>
  )
}
