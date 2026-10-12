import type { Database } from '@/shared/api/database.types'
import {
  normalizeTipInput,
  type Tip,
  TipError,
  type TipInput,
  tipSchema,
} from '@/entities/tip/model/tip'
import { slugifyTagLabel } from '@/entities/tag/model/tag'
import { getSupabaseClient } from '@/shared/api/supabase'

type PostRow = Database['public']['Tables']['posts']['Row']

function toTip(row: PostRow): Tip {
  const parsed = tipSchema.safeParse({
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    id: row.id,
    journeyId: row.journey_id,
    publishedAt: row.published_at,
    slug: row.slug,
    spaceId: row.space_id,
    title: row.title,
    updatedAt: row.updated_at,
    visibility: row.visibility,
  })
  if (!parsed.success) {
    throw new TipError('invalid_row', parsed.error.message, parsed.error)
  }
  return parsed.data
}

function validated(input: TipInput): TipInput {
  const result = normalizeTipInput(input)
  if (!result.ok) throw new TipError('invalid_input', result.reason)
  return result.value
}

/** Slug unique per space: the title plus a short id suffix, never changed later. */
export function tipSlug(title: string, id: string): string {
  const base = slugifyTagLabel(title).slice(0, 60).replace(/-+$/, '')
  return `${base}-${id.replace(/-/g, '').slice(0, 6)}`
}

function publishedAt(
  visibility: TipInput['visibility'],
  previous: string | null,
) {
  if (visibility === 'private') return null
  return previous ?? new Date().toISOString()
}

function rpcCode(code: string | undefined) {
  return code === '42501' ? 'forbidden' : undefined
}

export async function listSpaceTips(
  spaceId: string,
  authorId: string,
): Promise<Tip[]> {
  const { data, error } = await getSupabaseClient()
    .from('posts')
    .select('*')
    .eq('space_id', spaceId)
    .eq('author_id', authorId)
    .eq('kind', 'tip')
    .order('updated_at', { ascending: false })
  if (error !== null) {
    throw new TipError('list_failed', error.message, error)
  }
  return data.map(toTip)
}

export async function createTip(args: {
  authorId: string
  id?: string
  input: TipInput
  spaceId: string
}): Promise<Tip> {
  const input = validated(args.input)
  const id = args.id ?? crypto.randomUUID()
  const { data, error } = await getSupabaseClient()
    .from('posts')
    .insert({
      author_id: args.authorId,
      body: input.body,
      id,
      kind: 'tip',
      published_at: publishedAt(input.visibility, null),
      slug: tipSlug(input.title, id),
      space_id: args.spaceId,
      title: input.title,
      visibility: input.visibility,
    })
    .select('*')
    .single()
  if (error !== null) {
    throw new TipError(
      rpcCode(error.code) ?? 'create_failed',
      error.message,
      error,
    )
  }
  return toTip(data)
}

export async function updateTip(tip: Tip, input: TipInput): Promise<Tip> {
  const next = validated(input)
  const { data, error } = await getSupabaseClient()
    .from('posts')
    .update({
      body: next.body,
      published_at: publishedAt(next.visibility, tip.publishedAt),
      title: next.title,
      visibility: next.visibility,
    })
    .eq('id', tip.id)
    .select('*')
    .maybeSingle()
  if (error !== null) {
    throw new TipError(
      rpcCode(error.code) ?? 'update_failed',
      error.message,
      error,
    )
  }
  if (data === null) throw new TipError('not_found')
  return toTip(data)
}

export async function deleteTip(tipId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('posts')
    .delete()
    .eq('id', tipId)
  if (error !== null) {
    throw new TipError('delete_failed', error.message, error)
  }
}
