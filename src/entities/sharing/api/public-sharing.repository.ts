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
  return {
    avatarUrl: space.avatar_url,
    bio: profileResult.data?.bio ?? space.description,
    handle: space.handle,
    journeys: journeysResult.data ?? [],
    name: space.name,
    standaloneEntries: (entriesResult.data ?? []).filter(
      ({ id }) => !linkedEntryIds.has(id),
    ),
  }
}

export async function resolvePublicJourney(handle: string, slug: string) {
  const spaceId = await getSpaceId(handle)
  if (spaceId === null) return null
  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .select('id')
    .eq('space_id', spaceId)
    .eq('slug', slug)
    .eq('visibility', 'public')
    .maybeSingle()
  if (error !== null) throw error
  return data?.id ?? null
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

async function getSpaceId(handle: string) {
  const { data, error } = await getSupabaseClient()
    .from('spaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle()
  if (error !== null) throw error
  return data?.id ?? null
}
