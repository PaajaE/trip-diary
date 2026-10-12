import type { Database } from '@/shared/api/database.types'
import {
  type MomentTagging,
  type Tag,
  TagError,
  tagSchema,
  type TagKind,
} from '@/entities/tag/model/tag'
import { getSupabaseClient } from '@/shared/api/supabase'

type TagRow = Database['public']['Tables']['tags']['Row']

/** Ids per `in (...)` filter; keeps the request URL well below proxy limits. */
const ID_CHUNK = 100
/** How many of the user's own free tags are offered as suggestions. */
const OWN_FREE_LIMIT = 100

const TAG_COLUMNS = 'id, kind, slug, label, gbif_taxon_id'

function toTag(
  row: Pick<TagRow, 'gbif_taxon_id' | 'id' | 'kind' | 'label' | 'slug'>,
): Tag {
  const parsed = tagSchema.safeParse({
    gbifTaxonId: row.gbif_taxon_id,
    id: row.id,
    kind: row.kind,
    label: row.label,
    slug: row.slug,
  })
  if (!parsed.success) {
    throw new TagError('invalid_row', parsed.error.message, parsed.error)
  }
  return parsed.data
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

/** The fixed categories plus the free tags this user created most recently. */
export async function listTagCatalog(userId: string): Promise<Tag[]> {
  const client = getSupabaseClient()
  const [categories, free] = await Promise.all([
    client
      .from('tags')
      .select(TAG_COLUMNS)
      .eq('kind', 'category')
      .order('label'),
    client
      .from('tags')
      .select(TAG_COLUMNS)
      .eq('kind', 'free')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(OWN_FREE_LIMIT),
  ])
  if (categories.error !== null) {
    throw new TagError(
      'list_failed',
      categories.error.message,
      categories.error,
    )
  }
  if (free.error !== null) {
    throw new TagError('list_failed', free.error.message, free.error)
  }
  return [...categories.data, ...free.data].map(toTag)
}

export async function listTagsByIds(tagIds: string[]): Promise<Tag[]> {
  const unique = [...new Set(tagIds)]
  const rows = await Promise.all(
    chunks(unique, ID_CHUNK).map(async (chunk) => {
      const { data, error } = await getSupabaseClient()
        .from('tags')
        .select(TAG_COLUMNS)
        .in('id', chunk)
      if (error !== null) {
        throw new TagError('list_failed', error.message, error)
      }
      return data
    }),
  )
  return rows.flat().map(toTag)
}

export async function listMomentTaggings(
  momentIds: string[],
): Promise<MomentTagging[]> {
  const rows = await Promise.all(
    chunks(momentIds, ID_CHUNK).map(async (chunk) => {
      const { data, error } = await getSupabaseClient()
        .from('taggings')
        .select('tag_id, target_id')
        .eq('target_type', 'moment')
        .in('target_id', chunk)
      if (error !== null) {
        throw new TagError('list_failed', error.message, error)
      }
      return data
    }),
  )
  return rows
    .flat()
    .map((row) => ({ momentId: row.target_id, tagId: row.tag_id }))
}

export interface TagDraft {
  createdBy: string
  gbifTaxonId?: number
  kind: Extract<TagKind, 'free' | 'species'>
  label: string
  slug: string
}

/**
 * Returns the tag with this kind and slug, creating it when missing. Tags are
 * global, so a concurrent creator may win the race: a unique violation then
 * falls back to reading the existing row.
 */
export async function findOrCreateTag(draft: TagDraft): Promise<Tag> {
  const client = getSupabaseClient()
  const read = async (): Promise<Tag | null> => {
    const { data, error } = await client
      .from('tags')
      .select(TAG_COLUMNS)
      .eq('kind', draft.kind)
      .eq('slug', draft.slug)
      .maybeSingle()
    if (error !== null) {
      throw new TagError('lookup_failed', error.message, error)
    }
    return data === null ? null : toTag(data)
  }

  const existing = await read()
  if (existing !== null) return existing

  const { data, error } = await client
    .from('tags')
    .insert({
      created_by: draft.createdBy,
      gbif_taxon_id: draft.gbifTaxonId ?? null,
      kind: draft.kind,
      label: draft.label,
      slug: draft.slug,
    })
    .select(TAG_COLUMNS)
    .single()
  if (error === null) return toTag(data)
  if (error.code === '23505') {
    const raced = await read()
    if (raced !== null) return raced
  }
  throw new TagError('create_failed', error.message, error)
}

/** Attaches a tag to a moment. Already attached counts as success. */
export async function addMomentTag(
  momentId: string,
  tagId: string,
  createdBy: string,
): Promise<void> {
  const { error } = await getSupabaseClient().from('taggings').insert({
    created_by: createdBy,
    tag_id: tagId,
    target_id: momentId,
    target_type: 'moment',
  })
  if (error === null || error.code === '23505') return
  throw new TagError(
    error.code === '42501' ? 'forbidden' : 'create_failed',
    error.message,
    error,
  )
}

export async function removeMomentTag(
  momentId: string,
  tagId: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('taggings')
    .delete()
    .eq('tag_id', tagId)
    .eq('target_type', 'moment')
    .eq('target_id', momentId)
  if (error !== null) {
    throw new TagError('delete_failed', error.message, error)
  }
}
