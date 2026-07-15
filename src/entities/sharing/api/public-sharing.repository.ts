import { loadPublicSpaceCardImages } from '@/entities/sharing/api/public-space-card-images'
import { compareJourneyEntriesNewestFirst } from '@/entities/journey/lib/compare-journey-entries'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function getPublicSpace(handle: string) {
  const client = getSupabaseClient()
  const { data: space, error: spaceError } = await client
    .from('spaces')
    .select('id, handle, name, description, avatar_url, personal_owner_id')
    .eq('handle', handle)
    .maybeSingle()
  if (spaceError !== null) throw spaceError
  if (space === null) return null

  const [journeysResult, entriesResult, profileResult] = await Promise.all([
    client
      .from('journeys')
      .select(
        'id, slug, title, summary, status, starts_at, ends_at, updated_at',
      )
      .eq('space_id', space.id)
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false }),
    client
      .from('entries')
      .select('id, slug, title, body, type, event_at, published_at, created_at')
      .eq('space_id', space.id)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .order('event_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    space.personal_owner_id === null
      ? Promise.resolve({ data: null, error: null })
      : client
          .from('profiles')
          .select('bio')
          .eq('id', space.personal_owner_id)
          .maybeSingle(),
  ])
  const error =
    journeysResult.error ?? entriesResult.error ?? profileResult.error
  if (error !== null) throw error

  const journeys = journeysResult.data ?? []
  const journeyIds = journeys.map(({ id }) => id)
  const journeySlugById = new Map(
    journeys.map((journey) => [journey.id, journey.slug]),
  )

  const journeyLinksResult =
    journeyIds.length === 0
      ? { data: [], error: null }
      : await client
          .from('entry_journey_links')
          .select('entry_id, journey_id')
          .in('journey_id', journeyIds)
  if (journeyLinksResult.error !== null) {
    throw journeyLinksResult.error
  }

  const entryJourneyIdByEntryId = new Map(
    journeyLinksResult.data.map(({ entry_id, journey_id }) => [
      entry_id,
      journey_id,
    ]),
  )

  const diaryEntries = (entriesResult.data ?? [])
    .map((entry) => {
      const journeyId = entryJourneyIdByEntryId.get(entry.id)
      return {
        ...entry,
        journeySlug:
          journeyId === undefined
            ? null
            : (journeySlugById.get(journeyId) ?? null),
      }
    })
    .sort((left, right) =>
      compareJourneyEntriesNewestFirst(
        {
          createdAt: left.created_at,
          eventAt: left.event_at,
          id: left.id,
        },
        {
          createdAt: right.created_at,
          eventAt: right.event_at,
          id: right.id,
        },
      ),
    )

  const cardImages = await loadPublicSpaceCardImages(
    client,
    journeyIds,
    diaryEntries.map(({ id }) => id),
  )

  return {
    avatarUrl: space.avatar_url,
    bio: profileResult.data?.bio ?? space.description,
    cardImages,
    diaryEntries,
    handle: space.handle,
    journeys,
    name: space.name,
  }
}

export async function resolvePublicJourney(handle: string, slug: string) {
  const meta = await resolvePublicJourneyMeta(handle, slug)
  return meta?.id ?? null
}

export async function resolvePublicEntry(handle: string, slug: string) {
  const spaceId = await getSpaceId(handle)
  if (spaceId === null) return null
  const { data, error } = await getSupabaseClient()
    .from('entries')
    .select('id')
    .eq('space_id', spaceId)
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle()
  if (error !== null) throw error
  return data?.id ?? null
}

export async function resolvePublicJourneyEntry(
  handle: string,
  journeySlug: string,
  entrySlug: string,
) {
  const [journeyId, entryId] = await Promise.all([
    resolvePublicJourney(handle, journeySlug),
    resolvePublicEntry(handle, entrySlug),
  ])
  if (journeyId === null || entryId === null) return null
  const { data, error } = await getSupabaseClient()
    .from('entry_journey_links')
    .select('entry_id')
    .eq('journey_id', journeyId)
    .eq('entry_id', entryId)
    .maybeSingle()
  if (error !== null) throw error
  return data?.entry_id ?? null
}

export async function getJourneyPublicPaths(
  journeyId: string,
): Promise<PublicJourneyPaths | null> {
  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .select('slug, space_id, spaces!inner(handle)')
    .eq('id', journeyId)
    .eq('visibility', 'public')
    .maybeSingle()

  if (error !== null) {
    throw error
  }
  if (data?.slug == null) {
    return null
  }

  const space = data.spaces as { handle: string } | { handle: string }[]
  const handle = Array.isArray(space) ? space[0]?.handle : space.handle
  if (handle === undefined) {
    return null
  }

  return {
    journeySlug: data.slug,
    spaceHandle: handle,
  }
}

export async function resolvePublicJourneyMeta(
  handle: string,
  slug: string,
): Promise<
  (PublicJourneyPaths & { id: string; summary: string; title: string }) | null
> {
  const spaceId = await getSpaceId(handle)
  if (spaceId === null) {
    return null
  }

  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .select('id, title, summary, slug')
    .eq('space_id', spaceId)
    .eq('slug', slug)
    .eq('visibility', 'public')
    .maybeSingle()

  if (error !== null) {
    throw error
  }
  if (data === null) {
    return null
  }

  return {
    id: data.id,
    journeySlug: slug,
    spaceHandle: handle,
    summary: data.summary,
    title: data.title,
  }
}

export async function getEntryPublicShare(entryId: string): Promise<{
  entrySlug: string
  journeySlug: string | null
  momentPath: string | null
  spaceHandle: string
  standalonePath: string
} | null> {
  const { data: entry, error: entryError } = await getSupabaseClient()
    .from('entries')
    .select('id, slug, space_id, visibility, status, spaces!inner(handle)')
    .eq('id', entryId)
    .eq('visibility', 'public')
    .eq('status', 'published')
    .maybeSingle()

  if (entryError !== null) {
    throw entryError
  }
  if (entry?.slug == null) {
    return null
  }

  const space = entry.spaces as { handle: string } | { handle: string }[]
  const spaceHandle = Array.isArray(space) ? space[0]?.handle : space.handle
  if (spaceHandle === undefined) {
    return null
  }

  const { data: link, error: linkError } = await getSupabaseClient()
    .from('entry_journey_links')
    .select('journey_id, journeys!inner(slug, visibility)')
    .eq('entry_id', entryId)
    .maybeSingle()

  if (linkError !== null) {
    throw linkError
  }

  let journeySlug: string | null = null
  let momentPath: string | null = null
  if (link !== null) {
    const journey = link.journeys as
      | { slug: string | null; visibility: string }
      | { slug: string | null; visibility: string }[]
    const journeyRow = Array.isArray(journey) ? journey[0] : journey
    if (journeyRow?.visibility === 'public' && journeyRow.slug !== null) {
      journeySlug = journeyRow.slug
      momentPath = `/${spaceHandle}/${journeyRow.slug}/${entry.slug}`
    }
  }

  return {
    entrySlug: entry.slug,
    journeySlug,
    momentPath,
    spaceHandle,
    standalonePath: `/${spaceHandle}/tipy/${entry.slug}`,
  }
}

async function getSpaceId(handle: string) {
  const { data, error } = await getSupabaseClient()
    .from('spaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle()
  if (error !== null) throw error
  return data?.id ?? null
}
