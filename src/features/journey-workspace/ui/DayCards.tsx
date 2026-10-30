import { Link } from '@tanstack/react-router'
import { ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UNKNOWN_DAY } from '@/features/journey-workspace/model/workspace-days'
import { formatDayCaption } from '@/features/journey-workspace/model/workspace-map'
import type {
  OverviewChapter,
  OverviewDay,
} from '@/features/journey-workspace/model/workspace-overview'
import type { WorkspaceSegment } from '@/features/journey-workspace/model/workspace-tree'
import { segmentElementId } from '@/features/journey-workspace/lib/outline-ids'
import {
  BASE_URL,
  countsText,
} from '@/features/journey-workspace/lib/moment-labels'
import {
  StateIcons,
  type EditingContext,
} from '@/features/journey-workspace/ui/moment-blocks'
import { DayStatusChips } from '@/features/journey-workspace/ui/DayStatusChips'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import {
  chapterRange,
  chapterTitle,
} from '@/features/journey-workspace/lib/chapter-labels'
import {
  ClampedBody,
  SegmentTextEditor,
} from '@/features/journey-workspace/ui/TextEditing'
import { cn } from '@/shared/lib/cn'
import { MosaicGrid } from '@/shared/ui/MosaicGrid'

const BADGE =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sunk px-[7px] py-px text-muted'

function Mosaic({ day }: { day: OverviewDay }) {
  return (
    <MosaicGrid
      cells={day.mosaic.map((item, index) => (
        <MediaThumb
          baseUrl={BASE_URL}
          className="block h-full w-full rounded-none"
          item={item}
          key={item.id}
          // The hero fills two thirds (the whole card when alone): the ~220 px
          // thumb is blurry there, the side cells are small enough for it.
          {...(index === 0
            ? { sizes: day.mosaic.length === 1 ? '340px' : '230px' }
            : {})}
        />
      ))}
      empty={<ImageIcon aria-hidden="true" size={28} />}
      testId="day-mosaic"
    />
  )
}

/** One day of the overview: mosaic, date, places and what is still missing. */
export function DayCard({
  day,
  journeyId,
  locale,
  onHover,
  onOpen,
}: {
  day: OverviewDay
  journeyId: string
  locale: string
  onHover: (day: OverviewDay | null) => void
  onOpen: (day: OverviewDay) => void
}) {
  const { t } = useTranslation()
  const caption =
    day.key === UNKNOWN_DAY
      ? t('workspace.dayUnknown')
      : (formatDayCaption(day.key, locale) ?? day.key)
  return (
    <Link
      className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-soft motion-reduce:transition-none"
      data-day-card={day.key}
      params={{ date: day.key, journeyId }}
      to="/j/$journeyId/workspace/day/$date"
      onBlur={() => {
        onHover(null)
      }}
      onClick={() => {
        onOpen(day)
      }}
      onFocus={() => {
        onHover(day)
      }}
      onMouseEnter={() => {
        onHover(day)
      }}
      onMouseLeave={() => {
        onHover(null)
      }}
    >
      <Mosaic day={day} />
      <span className="flex flex-col gap-0.5 px-3 pt-2.5 pb-3">
        <span className="flex items-baseline justify-between gap-2">
          <b className="reader-display text-[17px]">{caption}</b>
          {day.number === null ? null : (
            <span className="text-[11.5px] tabular-nums text-faint">
              {t('workspace.dayNumber', { n: day.number })}
            </span>
          )}
        </span>
        <span className="truncate text-[13px] text-muted">
          {day.places.length > 0 ? day.places.join(' · ') : ' '}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-faint">
          {day.photoCount > 0 ? (
            <span className={BADGE}>
              {t('terms.photo.count', { count: day.photoCount })}
            </span>
          ) : null}
          <DayStatusChips status={day.status} />
        </span>
      </span>
    </Link>
  )
}

const COMPACT_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors'

function SuggestionButtons({
  editing,
  node,
}: {
  editing: EditingContext
  node: WorkspaceSegment
}) {
  const { t } = useTranslation()
  return (
    <>
      <button
        className={cn(
          COMPACT_BUTTON,
          'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
        data-accept=""
        type="button"
        onClick={() => {
          void editing.edits.acceptSegment(node.segment)
        }}
      >
        {t('workspace.acceptSuggestion')}
      </button>
      <button
        className={cn(
          COMPACT_BUTTON,
          'border border-border/80 bg-surface hover:bg-sunk',
        )}
        type="button"
        onClick={() => {
          void editing.edits.rejectSegment(node.segment)
        }}
      >
        {t('workspace.rejectSuggestion')}
      </button>
    </>
  )
}

/** A suggested trip inside a stage: one compact row with the decision. */
function NestedSuggestion({
  editing,
  locale,
  node,
}: {
  editing: EditingContext
  locale: string
  node: WorkspaceSegment
}) {
  const { t } = useTranslation()
  const { segment } = node
  const range = chapterRange(segment, locale)
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-warn/60 bg-warn-soft/50 px-3 py-1.5"
      id={segmentElementId(segment.id)}
    >
      <span className="min-w-0 flex-1 basis-40">
        <span className="block truncate text-sm font-semibold text-warn">
          {segment.title}
        </span>
        <span className="block text-xs text-muted">
          {t('workspace.suggestedBadge')} ·{' '}
          {t(`terms.${segment.kind}.singular`)} · {range}
        </span>
      </span>
      <span className="flex gap-2">
        <SuggestionButtons editing={editing} node={node} />
      </span>
    </li>
  )
}

/** Chapter header (title, range, text, suggestion decision) plus its day cards. */
export function ChapterSection({
  chapter,
  editing,
  journeyId,
  locale,
  onHoverDay,
  onOpenDay,
}: {
  chapter: OverviewChapter
  editing: EditingContext
  journeyId: string
  locale: string
  onHoverDay: (day: OverviewDay | null) => void
  onOpenDay: (day: OverviewDay) => void
}) {
  const { t } = useTranslation()
  const { node, segment } = chapter
  const warn = chapter.suggested || chapter.kind === 'loose'
  const title = chapterTitle(chapter, t('workspace.looseMoments'))
  const counts = countsText(t, {
    photos: chapter.photoCount,
    videos: 0,
  })
  const kind =
    chapter.kind === 'loose' ? null : t(`terms.${chapter.kind}.singular`)
  const meta = [
    chapter.suggested ? t('workspace.overview.autoSuggestion') : null,
    kind,
    chapterRange(chapter, locale) || null,
    t('workspace.daysCount', { count: chapter.days.length }),
    counts || null,
  ]
    .filter((part) => part !== null)
    .join(' · ')
  return (
    <section
      aria-label={title}
      className="mb-7 scroll-mt-24"
      data-chapter-id={chapter.id}
      data-kind={chapter.kind}
      data-testid={chapter.kind === 'loose' ? 'loose-group' : undefined}
      id={chapter.elementId}
    >
      <header className="mb-3.5 flex flex-wrap items-end justify-between gap-x-3.5 gap-y-2 border-b border-border pb-2.5">
        <div className="min-w-0">
          <p className="text-xs text-muted">{meta}</p>
          <h2
            className={cn(
              'reader-display flex items-center gap-1.5 text-2xl leading-tight',
              warn && 'text-warn',
            )}
          >
            <span className="min-w-0">{title}</span>
            {segment === null ? null : (
              <StateIcons locked={false} manual={segment.origin === 'manual'} />
            )}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chapter.suggested && node !== null ? (
            <SuggestionButtons editing={editing} node={node} />
          ) : null}
          {segment === null ? null : (
            <SegmentTextEditor edits={editing.edits} segment={segment} />
          )}
        </div>
      </header>
      {segment === null || segment.body === '' ? null : (
        <div className="mb-3.5">
          <ClampedBody body={segment.body} />
        </div>
      )}
      {chapter.suggestions.length > 0 ? (
        <ul className="m-0 mb-3.5 flex list-none flex-col gap-2 p-0">
          {chapter.suggestions.map((child) => (
            <NestedSuggestion
              editing={editing}
              key={child.segment.id}
              locale={locale}
              node={child}
            />
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3.5">
        {chapter.days.map((day) => (
          <DayCard
            day={day}
            journeyId={journeyId}
            key={day.key}
            locale={locale}
            onHover={onHoverDay}
            onOpen={onOpenDay}
          />
        ))}
      </div>
    </section>
  )
}
