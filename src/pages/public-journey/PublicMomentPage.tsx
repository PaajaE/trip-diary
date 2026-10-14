import { Link } from '@tanstack/react-router'
import type { PublicJourney } from '@trip-diary/core/public-journey'
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildJourneyModel,
  formatInZone,
  zoneOf,
} from '@/entities/public-journey/lib/journey-model'
import { resolveImage } from '@/entities/public-journey/lib/media-url'
import { excerpt } from '@/features/public-journey/lib/format'
import { TargetEngagement } from '@/features/public-engagement/ui/CommentsSection'
import { MediaGallery } from '@/features/public-journey/ui/MediaGallery'
import { Crumbs } from '@/pages/public-journey/Crumbs'
import { PublicRouteNotFound } from '@/pages/public-space/PublicRouteMessage'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { OsmAttribution } from '@/shared/ui/OsmAttribution'

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
  const model = useMemo(() => buildJourneyModel(data), [data])
  const moment = model.momentById.get(momentId)
  const media = model.mediaByMoment.get(momentId) ?? []
  const first = media[0]
  const firstImage = first === undefined ? null : resolveImage(first)
  const title = moment?.title ?? t('publicJourney.untitledMoment')
  useDocumentMeta(
    moment === undefined
      ? null
      : {
          ...(moment.body !== '' ? { description: excerpt(moment.body) } : {}),
          ...(firstImage !== null ? { imageUrl: firstImage.src } : {}),
          title: `${title} · ${data.journey.title}`,
        },
  )
  if (moment === undefined) {
    return <PublicRouteNotFound labelKey="publicJourney.momentNotFound" />
  }

  const segment = model.segmentOfInstant(moment.startsAt)
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

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <Crumbs
        crumbs={[
          { label: data.journey.title, to: 'journey' },
          ...(segment !== null
            ? [
                {
                  label: segment.title,
                  segmentId: segment.id,
                  to: 'segment' as const,
                },
              ]
            : []),
          { label: title },
        ]}
        journeySlug={journeySlug}
        spaceHandle={spaceHandle}
      />
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-sm text-muted">
          {formatInZone(moment.startsAt, zone, i18n.language, {
            dateStyle: 'long',
            timeStyle: 'short',
          })}
        </p>
        {place !== undefined ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <MapPin aria-hidden="true" className="size-4" />
            <span>
              {place.name}
              {place.region !== null ? `, ${place.region}` : ''}
            </span>
            <OsmAttribution />
          </p>
        ) : null}
      </header>
      {moment.body !== '' ? (
        <p className="whitespace-pre-line leading-7">{moment.body}</p>
      ) : null}
      <MediaGallery items={media} label={t('publicJourney.gallery')} />
      <TargetEngagement target={{ id: moment.id, type: 'moment' }} />
      <nav
        aria-label={t('publicJourney.momentNav')}
        className="flex justify-between gap-4 border-t border-border pt-4 text-sm"
      >
        {prev !== undefined ? (
          <Link
            className="flex items-center gap-1 underline"
            params={{ journeySlug, momentId: prev.id, spaceHandle }}
            to="/$spaceHandle/$journeySlug/m/$momentId"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {t('publicJourney.previous')}
          </Link>
        ) : (
          <span />
        )}
        {next !== undefined ? (
          <Link
            className="flex items-center gap-1 underline"
            params={{ journeySlug, momentId: next.id, spaceHandle }}
            to="/$spaceHandle/$journeySlug/m/$momentId"
          >
            {t('publicJourney.next')}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  )
}
