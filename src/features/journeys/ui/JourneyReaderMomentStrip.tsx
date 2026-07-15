import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import { formatMomentDateTimeLabel } from '@/features/journeys/lib/format-moment-datetime'
import { useJourneyMomentPhotos } from '@/features/journeys/lib/use-journey-moment-photos'
import {
  sortJourneyMomentsNewestFirst,
  type JourneyMoment,
} from '@/features/journeys/lib/journey-content'
import {
  getMomentExcerpt,
  handleStripKeyDown,
  scrollMomentIntoView,
} from '@/features/journeys/ui/journey-reader-moment-strip.logic'
import { cn } from '@/shared/lib/cn'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'

export interface JourneyReaderMomentStripHandle {
  scrollToMoment: (entryId: string) => void
}

interface JourneyReaderMomentStripProps {
  activeMomentId: string | null
  moments: JourneyMoment[]
  onActivateMoment: (entryId: string) => void
}

export const JourneyReaderMomentStrip = forwardRef<
  JourneyReaderMomentStripHandle,
  JourneyReaderMomentStripProps
>(function JourneyReaderMomentStrip(
  { activeMomentId, moments, onActivateMoment },
  ref,
) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const orderedMoments = sortJourneyMomentsNewestFirst(moments)
  const { isPending, photosByEntryId } = useJourneyMomentPhotos(
    orderedMoments,
    orderedMoments.length > 0,
    'thumb',
  )

  useImperativeHandle(ref, () => ({
    scrollToMoment(entryId) {
      scrollMomentIntoView(entryId, cardRefs.current, listRef.current)
    },
  }))

  useEffect(() => {
    if (activeMomentId === null) {
      return
    }
    scrollMomentIntoView(activeMomentId, cardRefs.current, listRef.current)
  }, [activeMomentId])

  if (orderedMoments.length === 0) {
    return null
  }

  return (
    <div className="reader-moment-strip mt-5">
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {t('reader.momentStripLabel')}
        </p>
      </div>
      <div
        aria-activedescendant={
          activeMomentId === null
            ? undefined
            : `reader-moment-${activeMomentId}`
        }
        aria-label={t('reader.momentNavigation')}
        className="reader-moment-strip__scroller mt-3 flex gap-3 overflow-x-auto px-5 pb-2 snap-x snap-mandatory scroll-px-5 sm:px-8 sm:scroll-px-8"
        onKeyDown={(event) => {
          handleStripKeyDown(
            event,
            orderedMoments,
            activeMomentId,
            onActivateMoment,
          )
        }}
        ref={listRef}
        role="listbox"
        tabIndex={0}
      >
        {isPending ? (
          <p className="px-1 text-sm text-muted" role="status">
            {t('reader.momentStripLoading')}
          </p>
        ) : null}
        {orderedMoments.map((moment, index) => (
          <MomentStripCard
            active={activeMomentId === moment.entry.id}
            index={index}
            key={moment.entry.id}
            moment={moment}
            onActivate={onActivateMoment}
            photos={photosByEntryId.get(moment.entry.id) ?? []}
            registerRef={(node) => {
              if (node === null) {
                cardRefs.current.delete(moment.entry.id)
                return
              }
              cardRefs.current.set(moment.entry.id, node)
            }}
            total={orderedMoments.length}
          />
        ))}
      </div>
    </div>
  )
})

function MomentStripCard({
  active,
  index,
  moment,
  onActivate,
  photos,
  registerRef,
  total,
}: {
  active: boolean
  index: number
  moment: JourneyMoment
  onActivate: (entryId: string) => void
  photos: PhotoPreview[]
  registerRef: (node: HTMLButtonElement | null) => void
  total: number
}) {
  const { i18n, t } = useTranslation()
  const coverPhoto = photos[0] ?? null
  const coverUrls = usePhotoObjectUrls(coverPhoto === null ? [] : [coverPhoto])
  const coverUrl = coverUrls[0]?.url
  const title = moment.entry.title ?? t('dashboard.untitled')
  const dateLabel = formatMomentDateTimeLabel(
    moment.entry.eventAt,
    i18n.language,
  )
  const excerpt = getMomentExcerpt(moment.entry.body)

  return (
    <button
      aria-label={t('reader.momentStripCardLabel', {
        index: index + 1,
        title,
        total,
      })}
      aria-selected={active}
      className={cn(
        'reader-moment-strip__card w-[min(72vw,14rem)] shrink-0 snap-start rounded-2xl border bg-surface text-left shadow-soft transition',
        active
          ? 'border-primary ring-2 ring-primary/25 ring-offset-2 ring-offset-background'
          : 'border-border/80 hover:border-border',
      )}
      id={`reader-moment-${moment.entry.id}`}
      onClick={() => {
        onActivate(moment.entry.id)
      }}
      ref={registerRef}
      role="option"
      type="button"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-[calc(1rem-1px)] bg-muted/20">
        {coverUrl === undefined ? (
          <div
            aria-hidden="true"
            className="flex h-full items-center justify-center text-xs font-medium uppercase tracking-[0.16em] text-muted"
          >
            {t('reader.momentStripNoPhoto')}
          </div>
        ) : (
          <img
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            loading="lazy"
            src={coverUrl}
          />
        )}
        {active ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-3 top-3 rounded-full bg-primary px-2 py-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-primary-foreground"
          >
            {t('reader.momentStripActive')}
          </span>
        ) : null}
      </div>
      <div className="space-y-1 px-3 py-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">
          {title}
        </p>
        {dateLabel === null ? null : (
          <p className="text-xs text-muted">{dateLabel}</p>
        )}
        {excerpt === '' ? null : (
          <p className="line-clamp-2 text-xs leading-5 text-muted">{excerpt}</p>
        )}
      </div>
    </button>
  )
}
