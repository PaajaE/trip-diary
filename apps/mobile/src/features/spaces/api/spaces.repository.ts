import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export class SpaceRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpaceRepositoryError'
  }
}

export async function resolveDefaultSpaceId(userId: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new SpaceRepositoryError('Supabase is not configured.')
  }

  const client = getSupabaseClient()
  const { data: memberships, error: membershipError } = await client
    .from('space_members')
    .select('space_id, role')
    .eq('user_id', userId)

  if (membershipError !== null) {
    throw new SpaceRepositoryError(membershipError.message)
  }

  if (memberships.length === 0) {
    throw new SpaceRepositoryError('No spaces are available for this account.')
  }

  const spaceIds = memberships.map((membership) => String(membership.space_id))
  const { data: spaces, error: spacesError } = await client
    .from('spaces')
    .select('id, kind, name')
    .in('id', spaceIds)

  if (spacesError !== null) {
    throw new SpaceRepositoryError(spacesError.message)
  }

  if (spaces.length === 0) {
    throw new SpaceRepositoryError('No spaces are available for this account.')
  }

  const personal = spaces.find((space) => space.kind === 'personal')
  if (personal !== undefined) {
    return String(personal.id)
  }

  return String(spaces[0].id)
}
