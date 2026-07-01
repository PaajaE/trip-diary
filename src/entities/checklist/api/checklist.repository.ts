import {
  journeyChecklistItemSchema,
  type JourneyChecklistItem,
} from '@/entities/checklist/model/checklist'
import { getSupabaseClient } from '@/shared/api/supabase'

function mapRemoteRow(row: {
  category: JourneyChecklistItem['category']
  checked_at: string | null
  entry_id: string | null
  id: string
  item_slug: string
  notes: string
  position: number
  stop_id: string | null
  template_slug: string
  title: string
}): JourneyChecklistItem {
  return journeyChecklistItemSchema.parse({
    category: row.category,
    checkedAt: row.checked_at,
    entryId: row.entry_id,
    id: row.id,
    itemSlug: row.item_slug,
    notes: row.notes,
    position: row.position,
    stopId: row.stop_id,
    templateSlug: row.template_slug,
    title: row.title,
  })
}

export async function listJourneyChecklistItemsRemote(
  journeyId: string,
): Promise<JourneyChecklistItem[]> {
  const { data, error } = await getSupabaseClient()
    .from('journey_checklist_items')
    .select(
      'id, template_slug, item_slug, title, notes, category, position, checked_at, stop_id, entry_id',
    )
    .eq('journey_id', journeyId)
    .order('position')

  if (error !== null) {
    throw error
  }

  return data.map(mapRemoteRow)
}

export async function insertJourneyChecklistItemRemote(input: {
  category: JourneyChecklistItem['category']
  creatorId: string
  id: string
  itemSlug: string
  journeyId: string
  notes: string
  position: number
  stopId: string | null
  templateSlug: string
  title: string
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journey_checklist_items')
    .insert({
      category: input.category,
      creator_id: input.creatorId,
      id: input.id,
      item_slug: input.itemSlug,
      journey_id: input.journeyId,
      notes: input.notes,
      position: input.position,
      stop_id: input.stopId,
      template_slug: input.templateSlug,
      title: input.title,
    })

  if (error !== null) {
    throw error
  }
}

export async function updateJourneyChecklistItemRemote(input: {
  checkedAt: string | null
  entryId: string | null
  id: string
  stopId: string | null
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journey_checklist_items')
    .update({
      checked_at: input.checkedAt,
      entry_id: input.entryId,
      stop_id: input.stopId,
    })
    .eq('id', input.id)

  if (error !== null) {
    throw error
  }
}
