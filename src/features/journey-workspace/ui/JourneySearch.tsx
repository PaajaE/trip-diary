import { useNavigate } from '@tanstack/react-router'
import { Search, Star, Video, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useDayNotes } from '@/entities/day-note/api/use-day-notes'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useJourneyPlaces } from '@/entities/place/api/use-journey-places'
import { useJourneyWorkspace } from '@/features/journey-workspace/api/use-journey-workspace'
import {
  BASE_URL,
  visibleTitle,
} from '@/features/journey-workspace/lib/moment-labels'
import {
  MIN_QUERY_LENGTH,
  normalizeQuery,
  searchJourney,
  type SearchData,
  type SearchFilters,
  type SearchResult,
} from '@/features/journey-workspace/model/journey-search'
import { collectMoments } from '@/features/journey-workspace/model/workspace-tree'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'
import { EmptyState } from '@/shared/ui/EmptyState'

const DEBOUNCE_MS = 150
const PAGE_LIMIT = 50
const EXPANDED_LIMIT = 300
const MEDIA_ROW = 12

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

type FilterKey = keyof SearchFilters

const FILTERS: readonly { icon?: typeof Star; key: FilterKey }[] = [
  { icon: Star, key: 'starred' },
  { icon: Video, key: 'video' },
  { key: 'noLocation' },
  { key: 'noCaption' },
]

const FILTER_LABEL: Record<FilterKey, string> = {
  noCaption: 'search.filterNoCaption',
  noLocation: 'search.filterNoLocation',
  starred: 'search.filterStarred',
  video: 'search.filterVideo',
}

function formatLocalDate(date: string, locale: string): string {
  // A calendar date has no zone: format its noon in UTC so no zone shifts it.
  const instant = Date.parse(`${date}T12:00:00Z`)
  if (Number.isNaN(instant)) return date
  return new Intl.DateTimeFormat(locale.startsWith('en') ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(instant))
}

/**
 * "Search the journey": a command-palette style dialog over the journey data
 * the workspace already holds in memory. Search runs on the device (works
 * offline, no server call). Opening a result goes to the workspace day page.
 */
export function JourneySearch({
  journeyId,
  onClose,
}: {
  journeyId: string
  onClose: () => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const navigate = useNavigate()
  const workspace = useJourneyWorkspace(journeyId)
  const notes = useDayNotes(journeyId)
  const tree = workspace.status === 'ready' ? workspace.tree : null
  const ordered = useMemo(
    () => (tree === null ? [] : collectMoments(tree)),
    [tree],
  )
  const placeIds = useMemo(
    () => [
      ...new Set(
        ordered.flatMap((entry) =>
          entry.moment.placeId === null ? [] : [entry.moment.placeId],
        ),
      ),
    ],
    [ordered],
  )
  const places = useJourneyPlaces(journeyId, placeIds)
  const placeNames = useMemo(
    () => new Map([...places].map(([id, place]) => [id, place.name])),
    [places],
  )
  const data = useMemo<SearchData>(
    () => ({
      dayNotes: [...notes.byDate].map(([date, body]) => ({ body, date })),
      media: [
        ...ordered.flatMap((entry) => entry.media),
        ...(tree?.unassigned ?? []),
      ],
      moments: ordered.map((entry) => ({
        body: entry.moment.body,
        id: entry.moment.id,
        placeLabel:
          visibleTitle(
            { ...entry, moment: { ...entry.moment, title: null } },
            placeNames,
          ) || null,
        startsAt: entry.moment.startsAt,
        title: entry.moment.title,
        tz: entry.tz,
      })),
    }),
    [notes.byDate, ordered, placeNames, tree],
  )
  const mediaById = useMemo(
    () => new Map(data.media.map((item) => [item.id, item])),
    [data.media],
  )

  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({})
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(text)
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [text])

  const filtersOn = Object.values(filters).some(Boolean)
  const searching =
    filtersOn || normalizeQuery(query).length >= MIN_QUERY_LENGTH
  const outcome = useMemo(
    () =>
      searchJourney(
        data,
        query,
        filters,
        expanded ? EXPANDED_LIMIT : PAGE_LIMIT,
      ),
    [data, query, filters, expanded],
  )
  const rows = useMemo(() => {
    const stops = outcome.results.filter((r) => r.kind === 'moment')
    const days = outcome.results.filter((r) => r.kind === 'day')
    const allMedia = outcome.results.filter((r) => r.kind === 'media')
    const media = expanded ? allMedia : allMedia.slice(0, MEDIA_ROW)
    return { days, media, stops }
  }, [outcome, expanded])
  const flat = useMemo(
    () => [...rows.stops, ...rows.days, ...rows.media],
    [rows],
  )
  const activeIndex = Math.min(active, flat.length - 1)

  const uid = useId()
  const optionId = (index: number) => `${uid}-option-${String(index)}`
  const titleId = `${uid}-title`
  const listId = `${uid}-list`
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      const node = rootRef.current
      if (event.key !== 'Tab' || node === null) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (first === undefined || last === undefined) return
      const current = document.activeElement
      if (event.shiftKey && (current === first || !node.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (current === last || !node.contains(current))
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    if (flat.length === 0) return
    document
      .getElementById(`${uid}-option-${String(Math.max(0, activeIndex))}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, flat.length, uid])

  function open(result: SearchResult) {
    if (result.localDate === null) {
      onClose()
      return
    }
    onClose()
    void navigate({
      params: { date: result.localDate, journeyId },
      to: '/j/$journeyId/workspace/day/$date',
    })
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (flat.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((Math.max(0, activeIndex) + step + flat.length) % flat.length)
    } else if (event.key === 'Enter') {
      const result = flat[activeIndex]
      if (result !== undefined) {
        event.preventDefault()
        open(result)
      }
    }
  }

  function toggle(key: FilterKey) {
    setFilters((current) => ({ ...current, [key]: current[key] !== true }))
    setActive(0)
    setExpanded(false)
  }

  const mediaTitle = (item: MediaItem | undefined): string => {
    const caption = item?.caption ?? ''
    if (caption !== '') return caption
    return t(item?.kind === 'video' ? 'search.video' : 'search.photo')
  }

  const announce = !searching
    ? ''
    : outcome.total === 0
      ? t('search.announceNone')
      : t('search.announce', { count: outcome.total })

  function optionProps(result: SearchResult) {
    const index = flat.indexOf(result)
    return {
      id: optionId(index),
      onMouseMove: () => {
        if (index !== activeIndex) setActive(index)
      },
      onMouseDown: (event: { preventDefault: () => void }) => {
        // Keep the focus in the input; the option is selected by activedescendant.
        event.preventDefault()
      },
    }
  }

  function dateText(result: SearchResult): string {
    return result.localDate === null
      ? t('search.noDate')
      : formatLocalDate(result.localDate, locale)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-start sm:p-6 sm:pt-[10vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-dvh w-full flex-col bg-background shadow-xl sm:h-auto sm:max-h-[80dvh] sm:max-w-2xl sm:rounded-xl"
        ref={rootRef}
        role="dialog"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <h2 className="sr-only" id={titleId}>
            {t('search.title')}
          </h2>
          <Search
            aria-hidden="true"
            className="shrink-0 text-muted"
            size={20}
          />
          <input
            aria-activedescendant={
              flat.length > 0 ? optionId(activeIndex) : undefined
            }
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={flat.length > 0}
            aria-label={t('search.inputLabel')}
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
            enterKeyHint="search"
            placeholder={t('search.placeholder')}
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            type="text"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setActive(0)
              setExpanded(false)
            }}
            onKeyDown={onInputKeyDown}
          />
          <button
            aria-label={t('search.close')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-surface"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div
          aria-label={t('search.filtersLabel')}
          className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2"
          role="group"
        >
          {FILTERS.map(({ icon: Icon, key }) => (
            <button
              aria-pressed={filters[key] === true}
              className={cn(
                'inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-4 text-sm font-medium',
                filters[key] === true
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:bg-surface',
              )}
              key={key}
              type="button"
              onClick={() => {
                toggle(key)
              }}
            >
              {Icon === undefined ? null : (
                <Icon aria-hidden="true" size={14} />
              )}
              {t(FILTER_LABEL[key])}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="sr-only" role="status">
          {announce}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {workspace.status === 'loading' ? (
            <p className="text-muted">{t('search.loading')}</p>
          ) : workspace.status === 'error' ? (
            <div className="space-y-3" role="alert">
              <p>{t('search.loadError')}</p>
              <button
                className={buttonVariants({ variant: 'secondary' })}
                type="button"
                onClick={workspace.retry}
              >
                {t('common.tryAgain')}
              </button>
            </div>
          ) : !searching ? (
            <p className="text-muted">{t('search.hint')}</p>
          ) : outcome.total === 0 ? (
            <EmptyState
              description={t('search.emptyDescription')}
              title={
                normalizeQuery(query).length >= MIN_QUERY_LENGTH
                  ? t('search.emptyTitle', { query: query.trim() })
                  : t('search.emptyTitleFiltered')
              }
            />
          ) : (
            <div
              aria-label={t('search.resultsLabel')}
              id={listId}
              role="listbox"
            >
              {rows.stops.length > 0 ? (
                <div
                  aria-label={t('search.groupStops')}
                  className="mb-3"
                  role="group"
                >
                  <h3
                    aria-hidden="true"
                    className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {t('search.groupStops')}
                  </h3>
                  {rows.stops.map((result) => (
                    <ResultRow
                      date={dateText(result)}
                      key={result.id}
                      optionProps={optionProps(result)}
                      selected={flat.indexOf(result) === activeIndex}
                      snippet={result.snippet}
                      title={result.title || t('search.untitledStop')}
                      onOpen={() => {
                        open(result)
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {rows.days.length > 0 ? (
                <div
                  aria-label={t('search.groupDays')}
                  className="mb-3"
                  role="group"
                >
                  <h3
                    aria-hidden="true"
                    className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {t('search.groupDays')}
                  </h3>
                  {rows.days.map((result) => (
                    <ResultRow
                      date=""
                      key={result.id}
                      optionProps={optionProps(result)}
                      selected={flat.indexOf(result) === activeIndex}
                      snippet={result.snippet}
                      title={dateText(result)}
                      onOpen={() => {
                        open(result)
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {rows.media.length > 0 ? (
                <div aria-label={t('search.groupMedia')} role="group">
                  <h3
                    aria-hidden="true"
                    className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {t('search.groupMedia')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {rows.media.map((result) => {
                      const item = mediaById.get(result.id)
                      const props = optionProps(result)
                      const selected = flat.indexOf(result) === activeIndex
                      return (
                        <div
                          {...props}
                          aria-selected={selected}
                          tabIndex={-1}
                          aria-label={`${mediaTitle(item)}, ${dateText(result)}`}
                          className={cn(
                            'cursor-pointer rounded-md p-0.5',
                            selected && 'ring-2 ring-primary',
                          )}
                          key={result.id}
                          role="option"
                          title={result.title || undefined}
                          onClick={() => {
                            open(result)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') open(result)
                          }}
                        >
                          {item === undefined ? null : (
                            <MediaThumb
                              baseUrl={BASE_URL}
                              className="h-16 w-16"
                              item={item}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {searching &&
          !expanded &&
          outcome.counts.media > rows.media.length ? (
            <button
              className={cn(buttonVariants({ variant: 'secondary' }), 'mt-3')}
              type="button"
              onClick={() => {
                setExpanded(true)
              }}
            >
              {t('search.showAll', { count: outcome.counts.media })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ResultRow({
  date,
  onOpen,
  optionProps,
  selected,
  snippet,
  title,
}: {
  date: string
  onOpen: () => void
  optionProps: Record<string, unknown>
  selected: boolean
  snippet: string
  title: string
}) {
  return (
    <div
      {...optionProps}
      aria-selected={selected}
      tabIndex={-1}
      className={cn(
        'cursor-pointer rounded-lg px-3 py-2',
        selected ? 'bg-surface ring-1 ring-primary' : 'hover:bg-surface',
      )}
      role="option"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen()
      }}
    >
      <p className="truncate font-semibold">{title}</p>
      {date === '' ? null : <p className="text-xs text-muted">{date}</p>}
      {snippet === '' || snippet === title ? null : (
        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{snippet}</p>
      )}
    </div>
  )
}
