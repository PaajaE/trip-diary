import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { DayStatus } from '@/features/journey-workspace/model/day-status'
import { cn } from '@/shared/lib/cn'

const CHIP =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-[7px] py-px text-[11.5px]'
const DONE = 'bg-primary-soft text-primary'
const PENDING = 'bg-accent-soft text-accent-strong'

/**
 * The two derived status chips of a day: photos (sorted or how many are left)
 * and the day note. On the overview card they are plain text inside the card
 * link; in the day detail the pending chip links to the batch sorter.
 */
export function DayStatusChips({
  detail = false,
  journeyId,
  status,
}: {
  /** Day detail wording, with the pending chip as a link to the sorter. */
  detail?: boolean
  journeyId?: string
  status: DayStatus
}) {
  const { t } = useTranslation()
  const size = detail ? 'px-2.5 py-1 text-[13px]' : ''
  return (
    <>
      {status.photos === 'done' ? (
        <span className={cn(CHIP, DONE, size)} data-status="photos-done">
          {detail
            ? t('dayDetail.photosDone')
            : t('workspace.overview.photosDone')}
        </span>
      ) : null}
      {status.photos === 'pending' ? (
        detail && journeyId !== undefined ? (
          <Link
            className={cn(CHIP, PENDING, size, 'underline')}
            data-status="photos-pending"
            params={{ journeyId }}
            to="/j/$journeyId/batch"
          >
            {t('dayDetail.photosPending', { count: status.unreviewed })}
          </Link>
        ) : (
          <span
            className={cn(CHIP, PENDING, size)}
            data-status="photos-pending"
          >
            {t('workspace.overview.photosPending', {
              count: status.unreviewed,
            })}
          </span>
        )
      ) : null}
      {status.note === 'has' ? (
        <span className={cn(CHIP, DONE, size)} data-status="note-has">
          {t('workspace.overview.noteHas')}
        </span>
      ) : null}
      {status.note === 'missing' ? (
        <span className={cn(CHIP, PENDING, size)} data-status="note-missing">
          {detail
            ? t('dayDetail.noteMissing')
            : t('workspace.overview.noteMissing')}
        </span>
      ) : null}
    </>
  )
}
