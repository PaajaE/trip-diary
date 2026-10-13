import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { tagQueryKeys } from '@/entities/tag/api/tag-query-keys'
import {
  MIN_QUERY_LENGTH,
  suggestSpecies,
  type SpeciesSuggestion,
} from '@/entities/tag/api/gbif-species'
import {
  LABEL_MAX_LENGTH,
  normalizeTagLabel,
  type Tag,
} from '@/entities/tag/model/tag'
import { tagDisplayLabel } from '@/features/moment-tags/lib/tag-label'
import {
  WorkspaceDialog,
  dialogButton,
} from '@/features/journey-workspace/ui/WorkspaceDialog'

const FIELD =
  'block min-h-10 w-full rounded-md border border-border bg-background px-3 py-2'
const PILL =
  'min-h-10 rounded-full border px-3 py-1.5 text-sm aria-pressed:border-primary aria-pressed:bg-surface aria-pressed:font-semibold border-border'
const DEBOUNCE_MS = 300

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])
  return debounced
}

export interface TagPickerDialogProps {
  attached: Tag[]
  catalog: Tag[]
  heading: string
  onAddFree: (label: string) => Promise<boolean>
  onAddSpecies: (species: SpeciesSuggestion) => Promise<boolean>
  onClose: () => void
  onToggle: (tag: Tag, attached: boolean) => Promise<boolean>
}

export function TagPickerDialog({
  attached,
  catalog,
  heading,
  onAddFree,
  onAddSpecies,
  onClose,
  onToggle,
}: TagPickerDialogProps) {
  const { i18n, t } = useTranslation()
  const ids = useId()
  const [freeText, setFreeText] = useState('')
  const [freeInvalid, setFreeInvalid] = useState(false)
  const [speciesText, setSpeciesText] = useState('')
  const [busy, setBusy] = useState(false)
  const speciesQuery = useDebounced(speciesText.trim(), DEBOUNCE_MS)
  const species = useQuery({
    enabled: Array.from(speciesQuery).length >= MIN_QUERY_LENGTH,
    queryFn: ({ signal }) =>
      suggestSpecies(speciesQuery, i18n.language, signal),
    queryKey: tagQueryKeys.species(i18n.language, speciesQuery),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const speciesTyped = Array.from(speciesText.trim()).length >= MIN_QUERY_LENGTH
  const speciesItems = speciesTyped ? species.data : undefined
  const attachedIds = new Set(attached.map((tag) => tag.id))
  const categories = catalog.filter((tag) => tag.kind === 'category')
  const freeSuggestions = catalog.filter((tag) => tag.kind === 'free')
  const attachedExtras = attached.filter((tag) => tag.kind !== 'category')

  const guarded = async (action: () => Promise<boolean>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try {
      return await action()
    } finally {
      setBusy(false)
    }
  }

  const submitFree = (event: SyntheticEvent) => {
    event.preventDefault()
    if (normalizeTagLabel(freeText) === null) {
      setFreeInvalid(freeText.trim() !== '')
      return
    }
    setFreeInvalid(false)
    void guarded(() => onAddFree(freeText)).then((ok) => {
      if (ok) setFreeText('')
    })
  }

  const toggle = (tag: Tag) => {
    void guarded(() => onToggle(tag, attachedIds.has(tag.id)))
  }

  return (
    <WorkspaceDialog title={heading} onClose={onClose}>
      <div className="mt-3 space-y-5">
        <section aria-labelledby={`${ids}-cat`}>
          <h3 className="text-sm font-semibold" id={`${ids}-cat`}>
            {t('tags.categories')}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((tag) => (
              <button
                aria-pressed={attachedIds.has(tag.id)}
                className={PILL}
                key={tag.id}
                type="button"
                onClick={() => {
                  toggle(tag)
                }}
              >
                {tagDisplayLabel(tag, t)}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby={`${ids}-free`}>
          <h3 className="text-sm font-semibold" id={`${ids}-free`}>
            {t('tags.free')}
          </h3>
          <form className="mt-2 flex gap-2" onSubmit={submitFree}>
            <input
              aria-describedby={freeInvalid ? `${ids}-free-err` : undefined}
              aria-invalid={freeInvalid}
              aria-labelledby={`${ids}-free`}
              className={FIELD}
              placeholder={t('tags.freePlaceholder')}
              type="text"
              value={freeText}
              onChange={(event) => {
                setFreeText(event.target.value)
                setFreeInvalid(false)
              }}
            />
            <button className={dialogButton} disabled={busy} type="submit">
              {t('tags.add')}
            </button>
          </form>
          {freeInvalid ? (
            <p
              className="mt-1 text-sm text-red-600"
              id={`${ids}-free-err`}
              role="alert"
            >
              {t('tags.labelTooLong', { max: LABEL_MAX_LENGTH })}
            </p>
          ) : null}
          {freeSuggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {freeSuggestions.map((tag) => (
                <button
                  aria-pressed={attachedIds.has(tag.id)}
                  className={PILL}
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    toggle(tag)
                  }}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section aria-labelledby={`${ids}-sp`}>
          <h3 className="text-sm font-semibold" id={`${ids}-sp`}>
            {t('tags.species')}
          </h3>
          <input
            aria-labelledby={`${ids}-sp`}
            className={`${FIELD} mt-2`}
            placeholder={t('tags.speciesPlaceholder')}
            type="search"
            value={speciesText}
            onChange={(event) => {
              setSpeciesText(event.target.value)
            }}
          />
          <p className="mt-1 text-xs text-muted">{t('tags.speciesHint')}</p>
          <div aria-live="polite">
            {speciesTyped &&
            (species.isFetching || speciesQuery !== speciesText.trim()) &&
            speciesItems === undefined &&
            !species.isError ? (
              <p className="mt-2 text-sm text-muted">{t('tags.searching')}</p>
            ) : null}
            {speciesTyped && species.isError ? (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {t('tags.speciesError')}
              </p>
            ) : null}
            {speciesItems?.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t('tags.noSpecies')}</p>
            ) : null}
          </div>
          {speciesItems !== undefined && speciesItems.length > 0 ? (
            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
              {speciesItems.map((item) => (
                <li key={item.taxonKey}>
                  <button
                    className="flex min-h-11 w-full flex-col items-start px-3 py-1.5 text-left"
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      void guarded(() => onAddSpecies(item)).then((ok) => {
                        if (ok) setSpeciesText('')
                      })
                    }}
                  >
                    <span className="text-sm font-medium">
                      {item.vernacularName ?? item.scientificName}
                    </span>
                    {item.vernacularName !== null ? (
                      <span className="text-xs italic text-muted">
                        {item.scientificName}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {attachedExtras.length > 0 ? (
          <section aria-labelledby={`${ids}-on`}>
            <h3 className="text-sm font-semibold" id={`${ids}-on`}>
              {t('tags.attached')}
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {attachedExtras.map((tag) => (
                <button
                  aria-label={t('tags.remove', { name: tag.label })}
                  className={PILL}
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    toggle(tag)
                  }}
                >
                  {tag.label} ×
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex justify-end">
          <button className={dialogButton} type="button" onClick={onClose}>
            {t('tags.done')}
          </button>
        </div>
      </div>
    </WorkspaceDialog>
  )
}
