import { useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChecklistItemCategory } from '@/entities/checklist/model/checklist'
import { createCustomChecklistItem } from '@/entities/checklist/api/checklist-mutation.repository'
import { TaxonNameSuggest } from '@/features/nature/ui/TaxonNameSuggest'
import { Button } from '@/shared/ui/Button'

interface CustomGoalFormProps {
  creatorId: string
  journeyId: string
  onCreated: () => void
}

const CATEGORIES: ChecklistItemCategory[] = [
  'wildlife',
  'flora',
  'geology',
  'landmark',
  'general',
]

export function CustomGoalForm({
  creatorId,
  journeyId,
  onCreated,
}: CustomGoalFormProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [scientificName, setScientificName] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [category, setCategory] = useState<ChecklistItemCategory>('wildlife')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (title.trim() === '') {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createCustomChecklistItem({
        category,
        creatorId,
        journeyId,
        notes:
          scientificName === null || scientificName === notes.trim()
            ? notes
            : [scientificName, notes.trim()]
                .filter((part) => part !== '')
                .join(' · '),
        title,
      })
      setTitle('')
      setNotes('')
      setScientificName(null)
      onCreated()
    } catch {
      setError(t('nature.custom.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="mt-4 space-y-3 rounded-2xl border border-dashed border-border/80 bg-background/40 p-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p className="text-sm font-medium">{t('nature.custom.title')}</p>
      {category === 'wildlife' || category === 'flora' ? (
        <TaxonNameSuggest
          inputClassName="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-primary/40"
          onChange={setTitle}
          onSelectTaxon={(taxon) => {
            setScientificName(taxon.scientificName)
          }}
          placeholder={t('nature.custom.nameLabel')}
          value={title}
        />
      ) : (
        <label className="block text-sm font-medium">
          {t('nature.custom.nameLabel')}
          <input
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-primary/40"
            onChange={(event) => {
              setTitle(event.target.value)
            }}
            value={title}
          />
        </label>
      )}
      <label className="block text-sm font-medium">
        {t('nature.custom.categoryLabel')}
        <select
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base"
          onChange={(event) => {
            setCategory(event.target.value as ChecklistItemCategory)
          }}
          value={category}
        >
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {t(`nature.custom.categories.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t('nature.custom.notesLabel')}
        <textarea
          className="mt-2 min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base"
          onChange={(event) => {
            setNotes(event.target.value)
          }}
          value={notes}
        />
      </label>
      <Button disabled={saving || title.trim() === ''} type="submit">
        {saving ? t('nature.custom.saving') : t('nature.custom.save')}
      </Button>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
