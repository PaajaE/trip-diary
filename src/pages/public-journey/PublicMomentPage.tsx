import { Link } from '@tanstack/react-router'
import type { PublicJourney } from '@trip-diary/core/public-journey'
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildJourneyModel,
  formatInZone,
  pickCover,
  zoneOf,
} from '@/entities/public-journey/lib/journey-model'
import { resolveImage } from '@/entities/public-journey/lib/media-url'
import { TargetEngagement } from '@/features/public-engagement/ui/CommentsSection'
import { excerpt } from '@/features/public-journey/lib/format'
import {
  aspectOfMedia,
  HERO_ASPECT,
} from '@/features/public-journey/lib/media-aspect'
import { publicMomentTitle } from '@/features/public-journey/lib/moment-title'
import { Crumbs } from '@/features/public-journey/ui/Crumbs'
import { MediaLightbox } from '@/features/public-journey/ui/MediaGallery'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'
import { PublicRouteNotFound } from '@/pages/public-space/PublicRouteMessage'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { PlaceAttribution } from '@/shared/ui/PlaceAttribution'

interface Props {
  data: PublicJourney
  journeySlug: string
  momentId: string
  spaceHandle: string
}

export function PublicMomentPage({
  data,
  journeySlug,
  momentId,
  spaceHandle,
}: Props) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const model = useMemo(() => buildJourneyModel(data), [data])
  const moment = model.momentById.get(momentId)
  const own = model.mediaByMoment.get(momentId)
  // The cover (else the first photo) is the hero, the rest is the strip.
  const media = useMemo(() => {
    const list = own ?? []
    const hero = pickCover(model, moment?.coverMediaId ?? null, list)
    return hero === null
      ? list
      : [hero, ...list.filter((m) => m.id !== hero.id)]
  }, [model, moment?.coverMediaId, own])
  const first = media[0]
  const firstImage = first === undefined ? null : resolveImage(first)
  const title =
    moment === undefined ? '' : publicMomentTitle(model, moment, t, locale)
  useDocumentMeta(
    moment === undefined
      ? null
      : {
          ...(moment.body !== '' ? { description: excerpt(moment.body) } : {}),
          ...(firstImage !== null ? { imageUrl: firstImage.src } : {}),
          title: `${title} · ${data.journey.title}`,
        },
  )
  const [lightbox, setLightbox] = useState<number | null>(null)
  if (moment === undefined) {
    return <PublicRouteNotFound labelKey="publicJourney.momentNotFound" />
  }

  const segment = model.segmentOfInstant(moment.startsAt)
  const stage = segment === null ? null : model.stageOf(segment.id)
  const zone =
    media.find((m) => m.capturedTz !== null)?.capturedTz ??
    zoneOf(model, segment)
  const index = model.moments.findIndex((m) => m.id === moment.id)
  const prev = index > 0 ? model.moments[index - 1] : undefined
  const next = model.moments[index + 1]
  // Hidden or unknown location: coordinates are null, so no place is shown.
  const locationKnown = moment.latitude !== null && moment.longitude !== null
  const place =
    locationKnown && moment.placeId !== null
      ? model.placeById.get(moment.placeId)
      : undefined

  const stageStops = stage === null ? [] : model.momentsInSpan(stage.id)
  const position = stageStops.findIndex((m) => m.id === moment.id) + 1
  const day =
    stage === null
      ? undefined
      : model
          .daysOfStage(stage.id)
          .find((d) => d.moments.some((m) => m.id === moment.id))
  const eyebrow = [
    stage === null
      ? null
      : t('publicJourney.stageBadge', {
          n: model.stages.findIndex((s) => s.id === stage.id) + 1,
        }),
    day === undefined ? null : t('publicJourney.dayOfStage', { n: day.number }),
    position > 0
      ? t('publicJourney.momentPosition', {
          n: position,
          total: stageStops.length,
        })
      : null,
  ]
    .filter((part) => part !== null)
    .join(' · ')
  const heroAspect =
    first === undefined
      ? 16 / 9
      : aspectOfMedia(first, HERO_ASPECT.min, HERO_ASPECT.max)
  const strip = media.slice(1)
  const momentLink = (id: string) => ({
    params: { journeySlug, momentId: id, spaceHandle },
    to: '/$spaceHandle/$journeySlug/m/$momentId' as const,
  })
  const titleOf = (id: string) => {
    const m = model.momentById.get(id)
    return m === undefined ? '' : publicMomentTitle(model, m, t, locale)
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-6 pb-28">
      <Crumbs
        crumbs={[
          { label: data.journey.title, to: 'journey' },
          ...(stage !== null
            ? [
                {
                  label: stage.title,
                  segmentId: stage.id,
                  to: 'segment' as const,
                },
              ]
            : []),
          { label: title },
        ]}
        journeySlug={journeySlug}
        spaceHandle={spaceHandle}
      />
      {first === undefined ? null : (
        <button
          aria-label={t('publicJourney.openMedia')}
          className="relative mt-4 block w-full cursor-zoom-in overflow-hidden rounded-xl bg-sunk"
          style={{ aspectRatio: String(heroAspect) }}
          type="button"
          onClick={() => {
            setLightbox(0)
          }}
        >
          <PublicMediaView
            className="absolute inset-0 h-full w-full object-cover"
            media={first}
            priority
            sizes="(min-width: 768px) 48rem, 100vw"
          />
          {first.caption === null ? null : (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-3 text-left text-sm text-white">
              {first.caption}
            </span>
          )}
        </button>
      )}
      <header className="mt-5 space-y-2">
        {eyebrow === '' ? null : (
          <p
            className="text-xs font-semibold tracking-[0.14em] uppercase"
            style={{
              color: stage === null ? undefined : model.stageColor(stage.id),
            }}
          >
            {eyebrow}
          </p>
        )}
        <h1 className="reader-display text-4xl leading-[1.05] sm:text-5xl">
          {title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>
            {formatInZone(moment.startsAt, zone, locale, {
              dateStyle: 'full',
              timeStyle: 'short',
            })}
          </span>
          {place !== undefined ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4" />
              {place.name}
              {place.region !== null ? `, ${place.region}` : ''}
              <PlaceAttribution />
            </span>
          ) : null}
        </p>
      </header>
      {moment.body !== '' ? (
        <p className="reader-body mt-5 max-w-[65ch] whitespace-pre-line text-lg leading-8">
          {moment.body}
        </p>
      ) : null}
      {strip.length > 0 ? (
        <ul
          aria-label={t('publicJourney.photoStrip')}
          className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
        >
          {strip.map((item, at) => (
            <li key={item.id}>
              <button
                aria-label={t('publicJourney.openMedia')}
                className="relative block w-full cursor-zoom-in overflow-hidden rounded-lg bg-sunk"
                style={{ aspectRatio: '4 / 3' }}
                type="button"
                onClick={() => {
                  setLightbox(at + 1)
                }}
              >
                <PublicMediaView
                  className="absolute inset-0 h-full w-full object-cover"
                  media={item}
                  sizes="(min-width: 768px) 12rem, 50vw"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6">
        <TargetEngagement target={{ id: moment.id, type: 'moment' }} />
      </div>
      <nav
        aria-label={t('publicJourney.momentNav')}
        className="mt-8 grid gap-3 sm:grid-cols-2"
      >
        {prev !== undefined ? (
          <Link
            className="block rounded-xl border border-border bg-surface p-4 hover:border-primary/40"
            {...momentLink(prev.id)}
          >
            <span className="flex items-center gap-1 text-xs text-muted">
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              {t('publicJourney.previous')}
            </span>
            <span className="reader-display block text-lg">
              {titleOf(prev.id)}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next !== undefined ? (
          <Link
            className="block rounded-xl border border-border bg-surface p-4 text-right hover:border-primary/40"
            {...momentLink(next.id)}
          >
            <span className="flex items-center justify-end gap-1 text-xs text-muted">
              {t('publicJourney.next')}
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </span>
            <span className="reader-display block text-lg">
              {titleOf(next.id)}
            </span>
          </Link>
        ) : null}
      </nav>
      <nav
        aria-label={t('publicJourney.floatingNav')}
        className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 whitespace-nowrap rounded-full bg-foreground px-5 py-3 text-sm text-background shadow-soft"
      >
        {stage === null ? null : (
          <Link
            className="inline-flex min-h-6 items-center gap-1 font-semibold"
            params={{ journeySlug, segmentId: stage.id, spaceHandle }}
            to="/$spaceHandle/$journeySlug/e/$segmentId"
          >
            <span aria-hidden="true">↑</span>
            {t('publicJourney.toStage')}
          </Link>
        )}
        {position > 0 ? (
          <span className="tabular-nums text-background/70">
            {`${String(position)} / ${String(stageStops.length)}`}
          </span>
        ) : null}
        {next === undefined ? null : (
          <Link
            className="inline-flex min-h-6 items-center gap-1 font-semibold"
            {...momentLink(next.id)}
          >
            {t('publicJourney.next')}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </nav>
      <MediaLightbox
        index={lightbox}
        items={media}
        onClose={() => {
          setLightbox(null)
        }}
        onIndexChange={setLightbox}
      />
    </main>
  )
}
