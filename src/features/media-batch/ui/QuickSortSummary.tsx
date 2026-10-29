import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDuration } from '@/features/journey-workspace/lib/format-range'
import type { QuickSortSummary as Summary } from '@/features/media-batch/model/quick-sort'
import { buttonVariants } from '@/shared/ui/button-variants'

export interface QuickSortSummaryProps {
  dayDone: boolean
  elapsedMs: number
  journeyId: string
  /** Last sorted day ("Napsat zápis dne"), null without a calendar day. */
  lastDay: string | null
  /** First open item of the next day, null when none. */
  nextDayId: string | null
  onClose: () => void
  onContinue: (targetId?: string) => void
  open: number
  summary: Summary
}

function stat(label: string, value: number): ReactNode {
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/** End of a quick-sort session: what was done, the day note, the next day. */
export function QuickSortSummary({
  dayDone,
  elapsedMs,
  journeyId,
  lastDay,
  nextDayId,
  onClose,
  onContinue,
  open,
  summary,
}: QuickSortSummaryProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const focusRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    focusRef.current?.focus()
  }, [])
  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 p-6"
      data-testid="quick-sort-summary"
      role="dialog"
    >
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-background p-6 text-foreground">
        <h3 className="text-center text-lg font-semibold" id={titleId}>
          {t(dayDone ? 'quickSort.summaryDayDone' : 'quickSort.summaryTitle')}
        </h3>
        <div className="grid grid-cols-2 gap-2 text-center">
          {stat(t('quickSort.summaryBest'), summary.starred)}
          {stat(t('quickSort.summaryTrashed'), summary.trashed)}
          {stat(t('quickSort.summaryStops'), summary.toStops)}
          {stat(t('quickSort.summaryDone'), summary.done)}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t('quickSort.summaryElapsed', { time: formatDuration(elapsedMs) })}
        </p>
        <div className="flex flex-col gap-2">
          {lastDay === null ? null : (
            <Link
              className={buttonVariants({ variant: 'primary' })}
              params={{ date: lastDay, journeyId }}
              to="/j/$journeyId/workspace/day/$date"
            >
              {t('quickSort.writeNote')}
            </Link>
          )}
          {nextDayId === null ? null : (
            <button
              className={buttonVariants({ variant: 'secondary' })}
              type="button"
              onClick={() => {
                onContinue(nextDayId)
              }}
            >
              {t('quickSort.nextDay')}
            </button>
          )}
          {open > 0 && nextDayId === null ? (
            <button
              className={buttonVariants({ variant: 'secondary' })}
              type="button"
              onClick={() => {
                onContinue()
              }}
            >
              {t('quickSort.keepGoing')}
            </button>
          ) : null}
          <button
            className={buttonVariants({ variant: 'secondary' })}
            ref={focusRef}
            type="button"
            onClick={onClose}
          >
            {t('quickSort.backToBatch')}
          </button>
        </div>
      </div>
    </div>
  )
}
