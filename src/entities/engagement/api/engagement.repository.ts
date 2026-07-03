import {
  contentCommentSchema,
  engagementSummarySchema,
  type ContentComment,
  type ContentTarget,
  type EngagementSummary,
} from '@/entities/engagement/model/engagement'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function getEngagementSummary(
  target: ContentTarget,
  viewerId: string | null,
): Promise<EngagementSummary> {
  const client = getSupabaseClient()
  const commentsQuery =
    viewerId === null
      ? client
          .from('content_comments')
          .select('id, body, created_at, updated_at, hidden_at, user_id')
          .eq('target_type', target.type)
          .eq('target_id', target.id)
          .order('created_at', { ascending: true })
      : client
          .from('content_comments')
          .select(
            'id, body, created_at, updated_at, hidden_at, user_id, profiles(display_name, username)',
          )
          .eq('target_type', target.type)
          .eq('target_id', target.id)
          .order('created_at', { ascending: true })

  const [heartCountResult, viewerHeartResult, commentsResult, canModerate] =
    await Promise.all([
      client
        .from('content_hearts')
        .select('*', { count: 'exact', head: true })
        .eq('target_type', target.type)
        .eq('target_id', target.id),
      viewerId === null
        ? Promise.resolve({ data: null, error: null })
        : client
            .from('content_hearts')
            .select('user_id')
            .eq('target_type', target.type)
            .eq('target_id', target.id)
            .eq('user_id', viewerId)
            .maybeSingle(),
      commentsQuery,
      viewerId === null
        ? Promise.resolve(false)
        : client
            .rpc('can_moderate_target', {
              p_target_id: target.id,
              p_target_type: target.type,
              p_user_id: viewerId,
            })
            .then(({ data, error }) => {
              if (error !== null) {
                throw error
              }
              return data
            }),
    ])

  if (heartCountResult.error !== null) {
    throw heartCountResult.error
  }
  if (viewerHeartResult.error !== null) {
    throw viewerHeartResult.error
  }

  const heartCount = heartCountResult.count ?? 0
  const viewerHasHearted = viewerHeartResult.data !== null

  const comments =
    commentsResult.error === null
      ? commentsResult.data.flatMap((row) => {
          if (row.hidden_at !== null && viewerId === null) {
            return []
          }
          if (
            row.hidden_at !== null &&
            row.user_id !== viewerId &&
            !canModerate
          ) {
            return []
          }

          const profile =
            'profiles' in row
              ? normalizeProfile(row.profiles)
              : { displayName: null, username: null }

          return [
            contentCommentSchema.parse({
              authorId: row.user_id,
              authorName:
                profile.displayName ??
                profile.username ??
                (viewerId === null ? 'Guest' : 'Guest'),
              body: row.body,
              createdAt: row.created_at,
              hiddenAt: row.hidden_at,
              id: row.id,
              isOwn: viewerId !== null && row.user_id === viewerId,
              updatedAt: row.updated_at,
            }),
          ]
        })
      : []

  return engagementSummarySchema.parse({
    canModerate,
    comments,
    heartCount,
    viewerHasHearted,
  })
}

export async function toggleContentHeart(
  target: ContentTarget,
): Promise<boolean> {
  const client = getSupabaseClient()
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser()
  if (userError !== null) {
    throw userError
  }
  if (user === null) {
    throw new Error('Sign in required')
  }

  const { data: existing, error: existingError } = await client
    .from('content_hearts')
    .select('user_id')
    .eq('target_type', target.type)
    .eq('target_id', target.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingError !== null) {
    throw existingError
  }

  if (existing !== null) {
    const { error } = await client
      .from('content_hearts')
      .delete()
      .eq('target_type', target.type)
      .eq('target_id', target.id)
      .eq('user_id', user.id)
    if (error !== null) {
      throw error
    }
    return false
  }

  const { error } = await client.from('content_hearts').insert({
    target_id: target.id,
    target_type: target.type,
    user_id: user.id,
  })
  if (error !== null) {
    throw error
  }
  return true
}

export async function addContentComment(
  target: ContentTarget,
  body: string,
): Promise<ContentComment> {
  const client = getSupabaseClient()
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser()
  if (userError !== null) {
    throw userError
  }
  if (user === null) {
    throw new Error('Sign in required')
  }

  const trimmed = body.trim()
  const { data, error } = await client
    .from('content_comments')
    .insert({
      body: trimmed,
      target_id: target.id,
      target_type: target.type,
      user_id: user.id,
    })
    .select(
      'id, body, created_at, updated_at, hidden_at, user_id, profiles(display_name, username)',
    )
    .single()

  if (error !== null) {
    throw error
  }

  const profile = normalizeProfile(data.profiles)
  return contentCommentSchema.parse({
    authorId: data.user_id,
    authorName: profile.displayName ?? profile.username ?? 'Guest',
    body: data.body,
    createdAt: data.created_at,
    hiddenAt: data.hidden_at,
    id: data.id,
    isOwn: true,
    updatedAt: data.updated_at,
  })
}

export async function updateContentComment(
  commentId: string,
  body: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('content_comments')
    .update({ body: body.trim() })
    .eq('id', commentId)
  if (error !== null) {
    throw error
  }
}

export async function deleteContentComment(commentId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('content_comments')
    .delete()
    .eq('id', commentId)
  if (error !== null) {
    throw error
  }
}

export async function hideContentComment(commentId: string): Promise<void> {
  const client = getSupabaseClient()
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser()
  if (userError !== null) {
    throw userError
  }
  if (user === null) {
    throw new Error('Sign in required')
  }

  const { error } = await client
    .from('content_comments')
    .update({
      hidden_at: new Date().toISOString(),
      hidden_by: user.id,
    })
    .eq('id', commentId)
  if (error !== null) {
    throw error
  }
}

function normalizeProfile(
  profile:
    | { display_name: string | null; username: string | null }
    | { display_name: string | null; username: string | null }[]
    | null,
) {
  if (profile === null) {
    return { displayName: null, username: null }
  }
  const row = Array.isArray(profile) ? profile[0] : profile
  if (row === undefined) {
    return { displayName: null, username: null }
  }
  return {
    displayName: row.display_name,
    username: row.username,
  }
}
