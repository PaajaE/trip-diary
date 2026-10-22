import { useTranslation } from 'react-i18next'
import type {
  OverviewChapter,
  StripDay,
} from '@/features/journey-workspace/model/workspace-overview'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import {
  chapterRange,
  chapterTitle,
} from '@/features/journey-workspace/lib/chapter-labels'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { cn } from '@/shared/lib/cn'

/** Colours of the day strip bars, cycled over the chapters. */
const STRIP_PALETTE = ['#9bb59f', '#7f9fb4', '#c9a479', '#a7b98a', '#d9a07f']

/** Ring showing the share of days that already have text. */
export function ProgressRing({
  className = 'size-[26px]',
  progress,
}: {
  className?: string
  progress: number
}) {
  const { t } = useTranslation()
  const radius = 11
  const circumference = 2 * Math.PI * radius
  const percent = Math.round(progress * 100)
  return (
    <svg
      aria-label={t('workspace.overview.progress', { percent })}
      className={className}
      role="img"
      viewBox="0 0 26 26"
    >
      <circle
        cx="13"
        cy="13"
        fill="none"
        r={radius}
        stroke="var(--color-border)"
        strokeWidth="3"
      />
      <circle
        cx="13"
        cy="13"
        fill="none"
        r={radius}
        stroke="var(--color-primary)"
        strokeDasharray={`${String(circumference * progress)} ${String(circumference)}`}
        strokeLinecap="round"
        strokeWidth="3"
        transform="rotate(-90 13 13)"
      />
    </svg>
  )
}

function Thumb({
  chapter,
  className,
}: {
  chapter: OverviewChapter
  className: string
}) {
  return chapter.cover === null ? (
    <span className={cn('shrink-0 rounded-lg bg-sunk', className)} />
  ) : (
    <MediaThumb
      baseUrl={BASE_URL}
      className={cn('rounded-lg', className)}
      item={chapter.cover}
    />
  )
}

function NewBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-accent-soft px-2 py-px text-[11.5px] text-accent">
      {t('workspace.overview.newBadge')}
    </span>
  )
}

interface RailProps {
  activeId: string | null
  chapters: OverviewChapter[]
  locale: string
  onJump: (chapterId: string) => void
}

/** Left column: chapters with cover, range and progress ring. */
export function StageRail({ activeId, chapters, locale, onJump }: RailProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {t('workspace.overview.stages')}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {chapters.map((chapter) => {
          const title = chapterTitle(chapter, t('workspace.looseMoments'))
          const range = chapterRange(chapter, locale)
          return (
            <li key={chapter.id}>
              <button
                aria-current={chapter.id === activeId ? 'true' : undefined}
                className={cn(
                  'grid min-h-11 w-full grid-cols-[30px_1fr_auto] items-center gap-2 rounded-[10px] p-2 text-left hover:bg-sunk',
                  chapter.id === activeId &&
                    'bg-primary-soft hover:bg-primary-soft',
                )}
                type="button"
                onClick={() => {
                  onJump(chapter.id)
                }}
              >
                <Thumb chapter={chapter} className="size-[30px]" />
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-[13px] font-semibold leading-tight',
                      (chapter.suggested || chapter.kind === 'loose') &&
                        'text-warn',
                    )}
                  >
                    {title}
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    {chapter.suggested
                      ? `${t('workspace.suggestedBadge')} · ${range}`
                      : range}
                  </span>
                </span>
                {chapter.suggested ? (
                  <NewBadge />
                ) : (
                  <ProgressRing progress={chapter.progress} />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Phone and small tablet: chapters as a horizontally scrolling chip strip. */
export function StageChips({
  activeId,
  chapters,
  onJump,
}: Omit<RailProps, 'locale'>) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('workspace.overview.stages')}
      className="no-scrollbar -mx-5 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8"
    >
      <ul className="m-0 flex w-max list-none gap-2 p-0">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <button
              aria-current={chapter.id === activeId ? 'true' : undefined}
              className={cn(
                'flex min-h-11 max-w-[15rem] items-center gap-2 rounded-full border border-border bg-surface py-1.5 pr-3 pl-1.5 text-left text-[13px] font-semibold',
                chapter.id === activeId && 'border-primary bg-primary-soft',
                (chapter.suggested || chapter.kind === 'loose') &&
                  'border-dashed text-warn',
              )}
              type="button"
              onClick={() => {
                onJump(chapter.id)
              }}
            >
              <Thumb chapter={chapter} className="size-7 rounded-full" />
              <span className="truncate">
                {chapterTitle(chapter, t('workspace.looseMoments'))}
              </span>
              {chapter.suggested ? (
                <NewBadge />
              ) : (
                <ProgressRing
                  className="size-5 shrink-0"
                  progress={chapter.progress}
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** One bar per day of the whole journey, coloured by chapter. */
export function DayStrip({
  days,
  onJump,
}: {
  days: StripDay[]
  onJump: (dayKey: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-3.5">
      <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {t('workspace.overview.wholeJourney')}
      </h2>
      <div className="flex flex-wrap gap-0.5 px-2" data-testid="day-strip">
        {days.map((day) => (
          <button
            aria-hidden="true"
            className={cn(
              'h-4 w-[7px] rounded-[2px] border-0 p-0',
              day.loose && 'border border-dashed border-warn bg-transparent',
            )}
            data-day={day.key}
            key={day.key}
            style={
              day.loose
                ? undefined
                : {
                    backgroundColor:
                      STRIP_PALETTE[day.colorIndex % STRIP_PALETTE.length] ??
                      '#9bb59f',
                  }
            }
            tabIndex={-1}
            type="button"
            onClick={() => {
              onJump(day.key)
            }}
          />
        ))}
      </div>
    </div>
  )
}
