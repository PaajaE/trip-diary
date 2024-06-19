import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Import from react-router-dom to use navigation
import { supabase } from '../supabaseClient';
import TripCard from './TripCard';
import { Tables } from '../types/supabase';  // Adjust path as necessary

type Trip = Tables<'trips'>;

/**
 * Component to display a list of trips for a given user.
 */
const TripList: React.FC<{ userId: string }> = ({ userId }) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate(); // Use navigate for routing

  useEffect(() => {
    const fetchTrips = async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching trips:', error);
        setError('Failed to fetch trips');
      } else {
        const trips: Trip[] = data
        setTrips(trips || []);
      }
      setLoading(false);
    };

    fetchTrips();
  }, [userId]);

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
          <button
            onClick={() => navigate('/trips/add')}
            className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Add New Trip
          </button>
        </div>
      )}
    </div>
  );
};

export default TripList;
