import {
  currentProfileSchema,
  getCurrentProfileSchema,
  profileSchema,
  updateOwnProfileSchema,
  uploadOwnAvatarSchema,
  type CurrentProfile,
  type GetCurrentProfileInput,
  type Profile,
  type UpdateOwnProfileInput,
  type UploadOwnAvatarInput,
} from '@/entities/profile/model/profile'
import { getSupabaseClient } from '@/shared/api/supabase'

const profileSelect =
  'id, username, display_name, avatar_url, bio, preferred_locale'

export async function getPublicProfile(
  username: string,
): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .eq('username', username)
    .maybeSingle()

  if (error !== null) {
    throw error
  }

  if (data?.username === undefined || data.username === null) {
    return null
  }

  return profileSchema.parse({
    avatarUrl: data.avatar_url,
    bio: data.bio,
    displayName: data.display_name,
    id: data.id,
    username: data.username,
  })
}

export async function getCurrentProfile(
  input: GetCurrentProfileInput,
): Promise<CurrentProfile | null> {
  const { userId } = getCurrentProfileSchema.parse(input)
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select(profileSelect)
    .eq('id', userId)
    .maybeSingle()

  if (error !== null) {
    throw error
  }

  return data === null ? null : mapCurrentProfile(data)
}

export async function updateOwnProfile(
  input: UpdateOwnProfileInput,
): Promise<CurrentProfile> {
  const profile = updateOwnProfileSchema.parse(input)
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .update({
      bio: profile.bio,
      display_name: profile.displayName,
      preferred_locale: profile.preferredLocale,
      username: profile.username,
    })
    .eq('id', profile.userId)
    .select(profileSelect)
    .single()

  if (error !== null) {
    throw error
  }

  return mapCurrentProfile(data)
}

export async function uploadOwnAvatar(
  input: UploadOwnAvatarInput,
): Promise<string> {
  const { avatar, userId } = uploadOwnAvatarSchema.parse(input)
  const client = getSupabaseClient()
  const storagePath = `${userId}/avatar.webp`
  const { error: uploadError } = await client.storage
    .from('avatars')
    .upload(storagePath, avatar, {
      cacheControl: '0',
      contentType: 'image/webp',
      upsert: true,
    })

  if (uploadError !== null) {
    throw uploadError
  }

  const { data: publicUrlData } = client.storage
    .from('avatars')
    .getPublicUrl(storagePath)
  const avatarUrl = zodUrl(publicUrlData.publicUrl)
  const { error: updateError } = await client
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)

  if (updateError !== null) {
    throw updateError
  }

  return avatarUrl
}

function mapCurrentProfile(data: {
  avatar_url: string | null
  bio: string | null
  display_name: string | null
  id: string
  preferred_locale: string
  username: string | null
}): CurrentProfile {
  return currentProfileSchema.parse({
    avatarUrl: data.avatar_url,
    bio: data.bio,
    displayName: data.display_name,
    id: data.id,
    preferredLocale: data.preferred_locale,
    username: data.username,
  })
}

function zodUrl(value: string): string {
  return profileSchema.shape.avatarUrl.unwrap().parse(value)
}
