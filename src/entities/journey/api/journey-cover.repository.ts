import { z } from 'zod'
import { JourneyCoverError } from '@/entities/journey/model/journey-cover'
import { getSupabaseClient } from '@/shared/api/supabase'

const coverIdSchema = z.uuid().nullable()

/** Reads journeys.cover_media_id (null when unset or journey not visible). */
export async function getJourneyCover(
  journeyId: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .select('cover_media_id')
    .eq('id', journeyId)
    .maybeSingle()
  if (error !== null) {
    throw new JourneyCoverError('read_failed', error.message, error)
  }
  return data?.cover_media_id ?? null
}

/** Sets (or clears with null) the journey cover. Needs the owner UPDATE grant. */
export async function setJourneyCover(
  journeyId: string,
  mediaId: string | null,
): Promise<void> {
  const parsed = coverIdSchema.safeParse(mediaId)
  if (!parsed.success) {
    throw new JourneyCoverError('invalid_input', parsed.error.message)
  }
  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .update({ cover_media_id: parsed.data })
    .eq('id', journeyId)
    .select('id')
    .maybeSingle()
  if (error !== null) {
    throw new JourneyCoverError('update_failed', error.message, error)
  }
  if (data === null) {
    throw new JourneyCoverError('not_found')
  }
}
