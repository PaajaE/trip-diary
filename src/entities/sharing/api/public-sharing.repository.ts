import { loadPublicSpaceCardImages } from '@/entities/sharing/api/public-space-card-images'
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

  const [journeysResult, entriesResult, linksResult, profileResult] =
    await Promise.all([
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
        .select('id, slug, title, body, type, event_at, published_at')
        .eq('space_id', space.id)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .order('published_at', { ascending: false }),
      client.from('entry_journey_links').select('entry_id'),
      space.personal_owner_id === null
        ? Promise.resolve({ data: null, error: null })
        : client
            .from('profiles')
            .select('bio')
            .eq('id', space.personal_owner_id)
            .maybeSingle(),
    ])
  const error =
    journeysResult.error ??
    entriesResult.error ??
    linksResult.error ??
    profileResult.error
  if (error !== null) throw error

  const linkedEntryIds = new Set(
    (linksResult.data ?? []).map(({ entry_id }) => entry_id),
  )
  const journeys = journeysResult.data ?? []
  const standaloneEntries = (entriesResult.data ?? []).filter(
    ({ id }) => !linkedEntryIds.has(id),
  )
  const cardImages = await loadPublicSpaceCardImages(
    client,
    journeys.map(({ id }) => id),
    standaloneEntries.map(({ id }) => id),
  )

  return {
    avatarUrl: space.avatar_url,
    bio: profileResult.data?.bio ?? space.description,
    cardImages,
    handle: space.handle,
    journeys,
    name: space.name,
    standaloneEntries,
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
