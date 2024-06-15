import { supabase } from '../supabaseClient';
import { PostgrestResponse } from '@supabase/supabase-js';

/**
 * SpeciesObservationData type definition.
 */
interface SpeciesObservationData {
  species_name: string;
  description: string;
  photo_url: string;
  gps_location?: [number, number];
  category: string;
  trip_id: number;
}

/**
 * Adds a new species observation.
 * @param {SpeciesObservationData} observationData - The species observation data.
 * @param {string} userId - The user ID.
 * @returns {Promise<SpeciesObservationData>} The created observation data.
 */
export const addSpeciesObservation = async (observationData: SpeciesObservationData, userId: string): Promise<SpeciesObservationData> => {
  const { data, error }: PostgrestResponse<SpeciesObservationData> = await supabase
    .from('species_observations')
    .insert([{ ...observationData, user_id: userId }])
    .select()
    .single();

  console.log({ data })

  if (error || !data) throw new Error(error?.message || 'Failed to add species observation');

  return data[0];
};
