import {
  addJourneyMemberSchema,
  journeyMemberSchema,
  journeyPendingInviteSchema,
  type AddJourneyMemberInput,
  type JourneyMember,
  type JourneyMemberRole,
  type JourneyPendingInvite,
} from '@/entities/journey/model/journey-member'
import { getSupabaseClient } from '@/shared/api/supabase'

export type JourneyInviteRole = Exclude<JourneyMemberRole, 'owner'>

export async function isJourneyOwner(journeyId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc('is_journey_owner', {
    p_journey_id: journeyId,
  })
  if (error !== null) {
    return false
  }
  return data
}

export async function getMyJourneyRole(
  journeyId: string,
  userId: string,
): Promise<JourneyMemberRole | null> {
  const { data, error } = await getSupabaseClient()
    .from('journey_members')
    .select('role')
    .eq('journey_id', journeyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error !== null) {
    throw error
  }
  if (data === null) {
    return null
  }
  return journeyMemberSchema.shape.role.parse(data.role)
}

export async function listJourneyPendingInvites(
  journeyId: string,
): Promise<JourneyPendingInvite[]> {
  const { data, error } = await getSupabaseClient().rpc(
    'list_journey_pending_invites',
    { p_journey_id: journeyId },
  )
  if (error !== null) {
    throw error
  }

  return data.map((invite) =>
    journeyPendingInviteSchema.parse({
      createdAt: invite.created_at,
      email: invite.email_normalized,
      expiresAt: invite.expires_at,
      id: invite.id,
      role: invite.role,
    }),
  )
}

export async function revokeJourneyInvite(inviteId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('revoke_journey_invite', {
    p_invite_id: inviteId,
  })
  if (error !== null) {
    throw error
  }
}

export async function listJourneyMembers(
  journeyId: string,
): Promise<JourneyMember[]> {
  const client = getSupabaseClient()
  const { data: members, error: membersError } = await client
    .from('journey_members')
    .select('user_id, role, created_at')
    .eq('journey_id', journeyId)

  if (membersError !== null) {
    throw membersError
  }
  if (members.length === 0) {
    return []
  }

  const { data: profiles, error: profilesError } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in(
      'id',
      members.map(({ user_id }) => user_id),
    )

  if (profilesError !== null) {
    throw profilesError
  }

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))

  return members.map((member) => {
    const profile = profilesById.get(member.user_id)
    return journeyMemberSchema.parse({
      avatarUrl: profile?.avatar_url ?? null,
      displayName: profile?.display_name ?? null,
      joinedAt: member.created_at,
      role: member.role,
      userId: member.user_id,
      username: profile?.username ?? null,
    })
  })
}

export async function addJourneyMemberByUsername(
  input: AddJourneyMemberInput,
): Promise<void> {
  const values = addJourneyMemberSchema.parse(input)
  const client = getSupabaseClient()
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id')
    .eq('username', values.username)
    .maybeSingle()

  if (profileError !== null) {
    throw profileError
  }
  if (profile === null) {
    throw new Error('Uživatel s tímto jménem neexistuje.')
  }

  const { error } = await client.from('journey_members').upsert(
    {
      journey_id: values.journeyId,
      role: values.role,
      user_id: profile.id,
    },
    { onConflict: 'journey_id,user_id' },
  )

  if (error !== null) {
    throw error
  }
}

export async function changeJourneyMemberRole(
  journeyId: string,
  userId: string,
  role: JourneyMemberRole,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journey_members')
    .update({ role })
    .eq('journey_id', journeyId)
    .eq('user_id', userId)

  if (error !== null) {
    throw error
  }
}

export async function removeJourneyMember(
  journeyId: string,
  userId: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journey_members')
    .delete()
    .eq('journey_id', journeyId)
    .eq('user_id', userId)

  if (error !== null) {
    throw error
  }
}

export async function createJourneyInvite(input: {
  email: string
  journeyId: string
  role: JourneyInviteRole
}): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc(
    'create_journey_invite',
    {
      p_email: input.email,
      p_journey_id: input.journeyId,
      p_role: input.role,
    },
  )
  if (error !== null) {
    throw error
  }
  return data
}

export async function getJourneyInvitePreview(token: string) {
  const { data, error } = await getSupabaseClient().rpc(
    'get_journey_invite_preview',
    { p_raw_token: token },
  )
  if (error !== null) {
    throw error
  }
  const preview = data[0]
  return preview === undefined
    ? null
    : {
        id: preview.journey_id,
        summary: preview.journey_summary,
        title: preview.journey_title,
      }
}

export async function acceptJourneyInvite(token: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc(
    'accept_journey_invite',
    {
      p_raw_token: token,
    },
  )
  if (error !== null) {
    throw error
  }
  return data
}
