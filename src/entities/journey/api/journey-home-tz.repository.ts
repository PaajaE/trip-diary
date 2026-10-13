import { z } from 'zod'
import { getSupabaseClient } from '@/shared/api/supabase'

const homeTzSchema = z.string().min(1).nullable()

/** Reads journeys.home_tz (null when unset or the journey is not visible). */
export async function getJourneyHomeTz(
  journeyId: string,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .select('home_tz')
    .eq('id', journeyId)
    .maybeSingle()
  if (error !== null) {
    throw new Error(error.message, { cause: error })
  }
  const parsed = homeTzSchema.safeParse(data?.home_tz ?? null)
  return parsed.success ? parsed.data : null
}
