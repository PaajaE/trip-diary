import { supabase } from '../supabaseClient';
import { PostgrestResponse } from '@supabase/supabase-js';

/**
 * TripData type definition.
 */
interface TripData {
  id: number;
  title: string;
  description: string;
  gpx_file: string | null;
  gps_reference?: [number, number];
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
  const { data, error }: PostgrestResponse<TripData> = await supabase
    .from('trips')
    .insert([{ ...tripData, user_id: userId }])
    .select()
    .single();

  console.log({ data })

  if (error || !data) throw new Error(error?.message || 'Failed to create trip');

  const tripId = data[0].id;

  if (tags && tags.length > 0) {
    const tagPromises = tags.map(async (tag) => {
      const { data: tagData, error: tagError }: PostgrestResponse<TagData> = await supabase
        .from('tags')
        .upsert([{ name: tag }], { onConflict: 'name' })
        .select()
        .single();

      if (tagError || !tagData) throw new Error(tagError?.message || 'Failed to create tag');

      const tagId = tagData[0].id;

      await supabase
        .from('trip_tags')
        .insert([{ trip_id: tripId, tag_id: tagId }]);
    });
    await Promise.all(tagPromises);
  }

  return data[0];
};
