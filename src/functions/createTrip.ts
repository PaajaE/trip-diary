import { supabase } from '../supabaseClient';
import { PostgrestSingleResponse } from '@supabase/supabase-js';
import { PhotosData } from '../types/photos';

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
 * PhotoData type definition.
 */
interface PhotoData {
  id?: number;
  url: string;
  trip_id?: number;
  user_id: string;
  gps_reference?: string;
  created_at?: string;
}

/**
 * Creates a new trip and associates photos with it.
 * @param {Omit<TripData, 'id' | 'user_id'>} tripData - The trip data.
 * @param {string} userId - The user ID.
 * @param {string[]} tags - The tags for the trip.
 * @param {string[]} photosData - The URLs of the photos to associate with the trip.
 * @returns {Promise<TripData>} The created trip data.
 */
export const createTrip = async (
  tripData: Omit<TripData, 'id' | 'user_id'>,
  userId: string,
  tags: string[],
  photosData: PhotosData[]
): Promise<TripData> => {
  const { data, error }: PostgrestSingleResponse<TripData> = await supabase
    .from('trips')
    .insert([{ ...tripData, user_id: userId }])
    .select().single();

  if (error || !data) throw new Error(error?.message || 'Failed to create trip');

  const tripId = data.id;

  if (tags && tags.length > 0) {
    const tagPromises = tags.map(async (tag) => {
      const { data: tagData, error: tagError }: PostgrestSingleResponse<TagData> = await supabase
        .from('tags')
        .upsert([{ name: tag }], { onConflict: 'name' })
        .select()
        .single();

      if (tagError || !tagData) throw new Error(tagError?.message || 'Failed to create tag');

      const tagId = tagData.id;

      await supabase
        .from('trip_tags')
        .insert([{ trip_id: tripId, tag_id: tagId }]);
    });
    await Promise.all(tagPromises);
  }

  if (photosData && photosData.length > 0) {
    const photoPromises = photosData.map(async ({url, gps_reference}) => {
      const photoData: PhotoData = {
        url,
        gps_reference,
        trip_id: tripId,
        user_id: userId,
      };

      const { error: photoError } = await supabase
        .from('photos')
        .insert([photoData]);

      if (photoError) throw new Error(photoError.message || 'Failed to insert photo');
    });
    await Promise.all(photoPromises);
  }

  return data;
};
