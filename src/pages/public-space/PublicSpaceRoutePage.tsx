import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { getPublicSpace } from '@/entities/sharing/api/public-sharing.repository'
import { sharingQueryKeys } from '@/entities/sharing/api/sharing-query-keys'
import { buildPublicSpaceShare } from '@/features/sharing/lib/build-share-messages'
import { PublicSpacePage } from '@/pages/public-space'
import {
  PublicRouteError,
  PublicRouteLoading,
  PublicRouteNotFound,
} from '@/pages/public-space/PublicRouteMessage'

export function PublicSpaceRoutePage() {
  const { spaceHandle } = useParams({ from: '/$spaceHandle' })
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const query = useQuery({
    queryFn: () => getPublicSpace(spaceHandle),
    queryKey: sharingQueryKeys.publicSpace(spaceHandle),
  })

  if (query.isPending) {
    return <PublicRouteLoading labelKey="publicSpace.loading" />
  }
  if (query.isError) {
    return <PublicRouteError labelKey="publicSpace.error" />
  }
  if (query.data === null) {
    return <PublicRouteNotFound labelKey="publicSpace.notFound" />
  }

  const space = query.data
  const spaceShare = buildPublicSpaceShare(
    space.handle,
    t('reader.shareSpaceMessage', { name: space.name }),
  )
  const dateLocale = i18n.language === 'cs' ? 'cs-CZ' : 'en-US'

  return (
    <PublicSpacePage
      onOpenEntry={(entryId) => {
        const entry = space.diaryEntries.find(({ id }) => id === entryId)
        if (entry === undefined) {
          return
        }

        if (entry.journeySlug !== null) {
          void navigate({
            params: {
              entrySlug: entry.slug,
              journeySlug: entry.journeySlug,
              spaceHandle,
            },
            to: '/$spaceHandle/$journeySlug/$entrySlug',
          })
          return
        }

        void navigate({
          params: { entrySlug: entry.slug, spaceHandle },
          to: '/$spaceHandle/tipy/$entrySlug',
        })
      }}
      onOpenJourney={(journeyId) => {
        const journey = space.journeys.find(({ id }) => id === journeyId)
        if (journey !== undefined) {
          void navigate({
            params: { journeySlug: journey.slug, spaceHandle },
            to: '/$spaceHandle/$journeySlug',
          })
        }
      }}
      shareText={spaceShare.shareText}
      shareUrl={spaceShare.shareUrl}
      space={{
        avatarUrl: space.avatarUrl,
        bio: space.bio,
        diaryEntries: space.diaryEntries.map((entry) => ({
          ...(space.cardImages.entryImageById[entry.id] !== undefined
            ? { imageUrl: space.cardImages.entryImageById[entry.id] }
            : {}),
          ...(entry.journeySlug === null
            ? {}
            : { journeySlug: entry.journeySlug }),
          dateLabel: new Date(
            entry.event_at ?? entry.published_at ?? 0,
          ).toLocaleDateString(dateLocale),
          excerpt: entry.body.slice(0, 180),
          id: entry.id,
          title: entry.title ?? t('dashboard.untitled'),
          typeLabel: t(`entry.type.${entry.type}`),
        })),
        handle: space.handle,
        journeys: space.journeys.map((journey) => {
          const cover = space.cardImages.journeyCoverById[journey.id]
          return {
          ...(cover !== undefined
            ? {
                coverUrl: cover.src,
                ...(cover.srcSet !== undefined
                  ? { coverSrcSet: cover.srcSet }
                  : {}),
              }
            : {}),
          dateLabel: journey.starts_at,
          id: journey.id,
          statusLabel: t(`journey.status.${journey.status}`),
          summary: journey.summary,
          title: journey.title,
        }
        }),
        name: space.name,
      }}
    />
  )
}
