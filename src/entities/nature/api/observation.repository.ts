import {
  natureObservationSchema,
  type NatureObservation,
} from '@/entities/nature/model/observation'
import { getSupabaseClient } from '@/shared/api/supabase'

function mapRemoteRow(row: {
  category: NatureObservation['category']
  checklist_item_id: string | null
  common_name: string
  confidence: NatureObservation['confidence']
  entry_id: string | null
  external_id: string | null
  external_source: string | null
  id: string
  journey_id: string
  latitude: number | null
  longitude: number | null
  notes: string
  observed_at: string | null
  photo_id: string | null
  scientific_name: string | null
}): NatureObservation {
  return natureObservationSchema.parse({
    category: row.category,
    checklistItemId: row.checklist_item_id,
    commonName: row.common_name,
    confidence: row.confidence,
    entryId: row.entry_id,
    externalId: row.external_id,
    externalSource: row.external_source,
    id: row.id,
    journeyId: row.journey_id,
    latitude: row.latitude,
    longitude: row.longitude,
    notes: row.notes,
    observedAt: row.observed_at,
    photoId: row.photo_id,
    scientificName: row.scientific_name,
  })
}

export async function listJourneyObservationsRemote(
  journeyId: string,
): Promise<NatureObservation[]> {
  const { data, error } = await getSupabaseClient()
    .from('nature_observations')
    .select(
      'id, journey_id, photo_id, entry_id, checklist_item_id, common_name, scientific_name, category, confidence, notes, latitude, longitude, external_source, external_id, observed_at',
    )
    .eq('journey_id', journeyId)
    .order('created_at', { ascending: false })

  if (error !== null) {
    throw error
  }

  return data.map(mapRemoteRow)
}

export async function insertNatureObservationRemote(input: {
  category: NatureObservation['category']
  checklistItemId: string | null
  commonName: string
  confidence: NatureObservation['confidence']
  creatorId: string
  entryId: string | null
  externalId: string | null
  externalSource: string | null
  id: string
  journeyId: string
  latitude: number | null
  longitude: number | null
  notes: string
  observedAt: string | null
  photoId: string | null
  scientificName: string | null
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('nature_observations')
    .insert({
      category: input.category,
      checklist_item_id: input.checklistItemId,
      common_name: input.commonName,
      confidence: input.confidence,
      creator_id: input.creatorId,
      entry_id: input.entryId,
      external_id: input.externalId,
      external_source: input.externalSource,
      id: input.id,
      journey_id: input.journeyId,
      latitude: input.latitude,
      longitude: input.longitude,
      notes: input.notes,
      observed_at: input.observedAt,
      photo_id: input.photoId,
      scientific_name: input.scientificName,
    })

  if (error !== null) {
    throw error
  }
}
