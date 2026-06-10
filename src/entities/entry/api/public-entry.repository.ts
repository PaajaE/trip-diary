import { entrySchema, type Entry } from '@/entities/entry/model/entry'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function getPublicEntry(id: string): Promise<Entry | null> {
  const { data, error } = await getSupabaseClient()
    .from('entries')
    .select(
      'id, creator_id, space_id, slug, type, title, body, language, visibility, status, event_at, version, created_at, updated_at, published_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (error !== null) {
    throw error
  }

  if (data === null) {
    return null
  }

  return entrySchema.parse({
    body: data.body,
    createdAt: data.created_at,
    creatorId: data.creator_id,
    eventAt: data.event_at,
    id: data.id,
    language: data.language,
    publishedAt: data.published_at,
    slug: data.slug,
    spaceId: data.space_id,
    status: data.status,
    syncStatus: 'synced',
    title: data.title,
    type: data.type,
    updatedAt: data.updated_at,
    version: data.version,
    visibility: data.visibility,
  })
}
