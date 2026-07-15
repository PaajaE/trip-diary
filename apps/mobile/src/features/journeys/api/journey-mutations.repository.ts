import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export class JourneyMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JourneyMutationError'
  }
}

function requireClient() {
  if (!isSupabaseConfigured()) {
    throw new JourneyMutationError('Supabase is not configured.')
  }

  return getSupabaseClient()
}

export async function updateJourneyRemote(
  journeyId: string,
  input: { summary: string; title: string },
): Promise<void> {
  const { error } = await requireClient()
    .from('journeys')
    .update({ summary: input.summary, title: input.title })
    .eq('id', journeyId)

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}

export async function deleteJourneyRemote(journeyId: string): Promise<void> {
  const { error } = await requireClient()
    .from('journeys')
    .delete()
    .eq('id', journeyId)

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}

export async function addJourneyStageRemote(
  journeyId: string,
  title: string,
  summary = '',
): Promise<void> {
  const { error } = await requireClient().rpc('create_journey_stage', {
    p_journey_id: journeyId,
    p_summary: summary,
    p_title: title,
  })

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}

export async function updateJourneyStageRemote(
  stageId: string,
  input: { summary: string; title: string },
): Promise<void> {
  const { error } = await requireClient()
    .from('journey_stages')
    .update({ summary: input.summary, title: input.title })
    .eq('id', stageId)

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}

export async function deleteJourneyStageRemote(stageId: string): Promise<void> {
  const { error } = await requireClient()
    .from('journey_stages')
    .delete()
    .eq('id', stageId)

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}
