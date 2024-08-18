import React from 'react';
import { Tables } from '../types/supabase';  // Adjust path as necessary

type Trip = Tables<'trips'>;

/**
 * Component to display the details of a single trip.
 */
const TripCard: React.FC<{ trip: Trip }> = ({ trip }) => {
  return (
    <div className="max-w-sm rounded overflow-hidden shadow-lg bg-white">
      <div className="px-6 py-4">
        <div className="font-bold text-xl text-black mb-2">{trip.title}</div>
        <p className="text-gray-700 text-base">
          {trip.description || 'No description provided.'}
        </p>
        <p className="text-sm text-gray-500">
          Created on: {trip.created_at ? new Date(trip.created_at).toLocaleDateString() : 'Unknown'}
        </p>
      </div>
    </div>
  );
};

export default TripCard;
