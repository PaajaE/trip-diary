import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchInaturalistTaxa } from '@/entities/nature/lib/inaturalist'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
import { cn } from '@/shared/lib/cn'
import { isBrowserOnline } from '@/shared/lib/network'

interface TaxonNameSuggestProps {
  className?: string
  inputClassName?: string
  onChange: (value: string) => void
  onSelectTaxon?: (taxon: {
    commonName: string
    scientificName: string
  }) => void
  placeholder?: string
  value: string
}

export function TaxonNameSuggest({
  className,
  inputClassName,
  onChange,
  onSelectTaxon,
  placeholder,
  value,
}: TaxonNameSuggestProps) {
  const { i18n, t } = useTranslation()
  const listboxId = useId()
  const [debouncedQuery, setDebouncedQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const online = isBrowserOnline()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(value)
    }, 300)
    return () => {
      window.clearTimeout(timer)
    }
  }, [value])

  const suggestionsQuery = useQuery({
    enabled: online && debouncedQuery.trim().length >= 2,
    queryFn: () => searchInaturalistTaxa(debouncedQuery, i18n.language),
    queryKey: natureQueryKeys.taxonSearch(debouncedQuery, i18n.language),
    staleTime: 60_000,
  })

  const suggestions = suggestionsQuery.data ?? []
  const showSuggestions = open && suggestions.length > 0

  return (
    <div className={cn('relative', className)}>
      <input
        aria-autocomplete="list"
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-expanded={showSuggestions}
        className={inputClassName}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false)
          }, 150)
        }}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
        }}
        placeholder={placeholder}
        role="combobox"
        value={value}
      />
      {showSuggestions ? (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-soft"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((taxon) => (
            <li key={taxon.id}>
              <button
                aria-selected={false}
                className="w-full px-3 py-2 text-left text-sm hover:bg-background"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(taxon.commonName)
                  onSelectTaxon?.({
                    commonName: taxon.commonName,
                    scientificName: taxon.scientificName,
                  })
                  setOpen(false)
                }}
                role="option"
                type="button"
              >
                <span className="font-medium">{taxon.commonName}</span>
                <span className="mt-0.5 block text-xs italic text-muted">
                  {taxon.scientificName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {online && debouncedQuery.trim().length >= 2 ? (
        <p className="mt-2 text-xs text-muted">
          {t('nature.inaturalistAttribution')}
        </p>
      ) : null}
    </div>
  )
}
