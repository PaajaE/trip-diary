import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import {
  formatMomentTimelineLabel,
  isAutoDayGroup,
} from '@/features/journeys/lib/format-moment-datetime'
import { cn } from '@/shared/lib/cn'

interface JourneyTimelineMomentsProps {
  className?: string
  content: Pick<JourneyStageContent, 'dayKey' | 'stage'>
  itemClassName?: string
  moments: JourneyMoment[]
  renderMoment: (moment: JourneyMoment, index: number) => ReactNode
}

export function JourneyTimelineMoments({
  className,
  content,
  itemClassName,
  moments,
  renderMoment,
}: JourneyTimelineMomentsProps) {
  const { i18n, t } = useTranslation()
  const inDayGroup = isAutoDayGroup(content)

  if (moments.length === 0) {
    return null
  }

  return (
    <ol className={cn('journey-timeline', className)}>
      {moments.map((moment, index) => {
        const timeLabel = formatMomentTimelineLabel(
          moment.entry.eventAt,
          i18n.language,
          inDayGroup,
        )

        return (
          <li
            className={cn('journey-timeline__item', itemClassName)}
            key={moment.entry.id}
          >
            <div
              aria-hidden={timeLabel === null}
              className="journey-timeline__marker"
            >
              {timeLabel === null ? (
                <span className="journey-timeline__time journey-timeline__time--placeholder">
                  ·
                </span>
              ) : (
                <time
                  className="journey-timeline__time"
                  {...(moment.entry.eventAt !== null
                    ? { dateTime: moment.entry.eventAt }
                    : {})}
                >
                  {timeLabel}
                </time>
              )}
              <span className="journey-timeline__dot" />
            </div>
            <div className="journey-timeline__content">
              {renderMoment(moment, index)}
            </div>
          </li>
        )
      })}
      {moments.some((moment) => moment.entry.eventAt === null) ? (
        <p className="sr-only">{t('journey.timelineUndatedHint')}</p>
      ) : null}
    </ol>
  )
}
