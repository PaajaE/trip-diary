import {
  acceptSpaceInviteSchema,
  createFamilySpaceSchema,
  createSpaceInviteSchema,
  spaceMemberSchema,
  spaceSummarySchema,
  type AcceptSpaceInviteInput,
  type CreateFamilySpaceInput,
  type CreateSpaceInviteInput,
  type SpaceMember,
  type SpaceRole,
  type SpaceSummary,
} from '@/entities/space/model/space'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function listMySpaces(userId: string): Promise<SpaceSummary[]> {
  const client = getSupabaseClient()
  const { data: memberships, error: membershipError } = await client
    .from('space_members')
    .select('space_id, role')
    .eq('user_id', userId)

  if (membershipError !== null) throw membershipError
  if (memberships.length === 0) return []

  const { data: spaces, error: spacesError } = await client
    .from('spaces')
    .select('id, kind, handle, name, description, avatar_url')
    .in(
      'id',
      memberships.map(({ space_id }) => space_id),
    )

  if (spacesError !== null) throw spacesError
  const roles = new Map(memberships.map((item) => [item.space_id, item.role]))

  return spaces.map((space) =>
    spaceSummarySchema.parse({
      avatarUrl: space.avatar_url,
      description: space.description,
      handle: space.handle,
      id: space.id,
      kind: space.kind,
      name: space.name,
      role: roles.get(space.id),
    }),
  )
}

export async function listSpaceMembers(
  spaceId: string,
): Promise<SpaceMember[]> {
  const client = getSupabaseClient()
  const { data: members, error: membersError } = await client
    .from('space_members')
    .select('user_id, role, created_at')
    .eq('space_id', spaceId)

  if (membersError !== null) throw membersError
  const { data: profiles, error: profilesError } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in(
      'id',
      members.map(({ user_id }) => user_id),
    )

  if (profilesError !== null) throw profilesError
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))

  return members.map((member) => {
    const profile = profilesById.get(member.user_id)
    return spaceMemberSchema.parse({
      avatarUrl: profile?.avatar_url ?? null,
      displayName: profile?.display_name ?? null,
      joinedAt: member.created_at,
      role: member.role,
      userId: member.user_id,
      username: profile?.username ?? null,
    })
  })
}

export async function createFamilySpace(
  input: CreateFamilySpaceInput,
): Promise<string> {
  const values = createFamilySpaceSchema.parse(input)
  const { data, error } = await getSupabaseClient().rpc('create_family_space', {
    p_handle: values.handle,
    p_name: values.name,
  })
  if (error !== null) throw error
  return data
}

export async function createSpaceInvite(
  input: CreateSpaceInviteInput,
): Promise<string> {
  const values = createSpaceInviteSchema.parse(input)
  const { data, error } = await getSupabaseClient().rpc('create_space_invite', {
    p_email: values.email,
    p_role: values.role,
    p_space_id: values.spaceId,
  })
  if (error !== null) throw error
  return data
}

export async function getSpaceInvitePreview(token: string) {
  const { data, error } = await getSupabaseClient().rpc(
    'get_space_invite_preview',
    { p_raw_token: token },
  )
  if (error !== null) throw error
  const preview = data[0]
  return preview === undefined
    ? null
    : {
        avatarUrl: preview.space_avatar_url,
        handle: preview.space_handle,
        id: preview.space_id,
        name: preview.space_name,
      }
}

export async function acceptSpaceInvite(
  input: AcceptSpaceInviteInput,
): Promise<string> {
  const { token } = acceptSpaceInviteSchema.parse(input)
  const { data, error } = await getSupabaseClient().rpc('accept_space_invite', {
    p_raw_token: token,
  })
  if (error !== null) throw error
  return data
}

export async function changeSpaceMemberRole(
  spaceId: string,
  userId: string,
  role: SpaceRole,
) {
  const { error } = await getSupabaseClient().rpc('change_space_member_role', {
    p_role: role,
    p_space_id: spaceId,
    p_user_id: userId,
  })
  if (error !== null) throw error
}

export async function removeSpaceMember(spaceId: string, userId: string) {
  const { error } = await getSupabaseClient().rpc('remove_space_member', {
    p_space_id: spaceId,
    p_user_id: userId,
  })
  if (error !== null) throw error
}
