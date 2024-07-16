import { supabase } from '../supabaseClient';
import { PostgrestSingleResponse } from '@supabase/supabase-js';

/**
 * TripData type definition.
 */
interface TripData {
  id: number;
  title: string;
  description: string;
  gpx_file: string | null;
  gps_reference?: string;
  user_id: string;
}

/**
 * TagData type definition.
 */
interface TagData {
  id: number;
  name: string;
}

/**
 * Creates a new trip.
 * @param {Omit<TripData, 'id' | 'user_id'>} tripData - The trip data.
 * @param {string} userId - The user ID.
 * @param {string[]} tags - The tags for the trip.
 * @returns {Promise<TripData>} The created trip data.
 */
export const createTrip = async (
  tripData: Omit<TripData, 'id' | 'user_id'>,
  userId: string,
  tags: string[]
): Promise<TripData> => {
  const { data, error }: PostgrestSingleResponse<TripData> = await supabase
    .from('trips')
    .insert([{ ...tripData, user_id: userId }])
    .select().single();

  console.log({ data })

  if (error || !data) throw new Error(error?.message || 'Failed to create trip');

  const tripId = data.id;
  console.log({tripId})

  if (tags && tags.length > 0) {
    const tagPromises = tags.map(async (tag) => {
      const { data: tagData, error: tagError }: PostgrestSingleResponse<TagData> = await supabase
        .from('tags')
        .upsert([{ name: tag }], { onConflict: 'name' })
        .select()
        .single()

      if (tagError || !tagData) throw new Error(tagError?.message || 'Failed to create tag');

      console.log({ tagData })

      const tagId = tagData.id;

      await supabase
        .from('trip_tags')
        .insert([{ trip_id: tripId, tag_id: tagId }]);
    });
    await Promise.all(tagPromises);
  }

  return data;
};
