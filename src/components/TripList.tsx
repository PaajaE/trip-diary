import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Import from react-router-dom to use navigation
import { supabase } from '../supabaseClient';
import TripCard from './TripCard';
import { type Session } from '@supabase/supabase-js'

// type Trip = Tables<'trips'>;

type Photo = {
  name: string | null;
  signedUrl?: string;
  is_cover_photo: boolean;
};

export type Trip = {
  id: number;
  created_at: string | null;
  title: string;
  description: string | null;
  gps_reference: unknown | null;
  photos: Photo[];
  coverPhoto?: Photo;
};

/**
 * Component to display a list of trips for a given user.
 */
const TripList: React.FC<{ session: Session }> = ({ session }) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate(); // Use navigate for routing

  console.log({ session })

  useEffect(() => {
    const fetchTrips = async () => {
      const { data, error } = await supabase
        .from('trips')
        .select(`
    id,
    title,
    description,
    gps_reference,
    created_at,
    photos (
        name,
        is_cover_photo
    )
  `)
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Error fetching trips:', error);
        setError('Failed to fetch trips');
      } else {
        const tripsWithSignedUrls = await Promise.all(
          data.map(async (trip: Trip) => {
            const coverPhoto = trip.photos.find(photo => photo.is_cover_photo) || trip.photos[0];

            if (coverPhoto && coverPhoto.name) {
              const { data, error } = await supabase.storage
                .from('trip-photos')
                .createSignedUrl(`/${coverPhoto.name}`, 3600)

              if (error) {
                console.error(error);
              } else {
                coverPhoto.signedUrl = data.signedUrl;
              }
            }


            return {
              ...trip,
              coverPhoto: coverPhoto,
            };
          })
        );

        if (tripsWithSignedUrls) {
          setTrips(tripsWithSignedUrls)
        }
      }
      setLoading(false);
    };

    fetchTrips();
  }, [session]);

  if (loading) return <div className="text-center">Loading...</div>;
  if (error) return <div className="text-center text-red-500">Error: {error}</div>;

  return (
    <div className="p-4">
      {trips.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {trips.map(trip => <TripCard key={trip.id} trip={trip} />)}
        </div>
      ) : (
        <div className="text-center mt-10">
          <p className="text-lg text-gray-600">No trips found. Start adding your adventures!</p>
        </div>

      )}
      <div className="text-center mt-10">
        <button
          onClick={() => navigate('/trips/add')}
          className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Add New Trip
        </button>
        <button
          onClick={() => navigate('/map')}
          className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Map
        </button>
      </div>
    </div>
  );
};

export default TripList;
