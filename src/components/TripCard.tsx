import React from 'react';
import { Trip } from './TripList';

/**
 * Component to display the details of a single trip.
 */
const TripCard: React.FC<{ trip: Trip }> = ({ trip }) => {
  const coverPhoto = trip.coverPhoto?.signedUrl; // Get the first photo (assumed to be the cover photo after filtering)
  console.log(trip)
  return (
    <div className="max-w-sm rounded overflow-hidden shadow-lg bg-white">
      {coverPhoto && (
        <img
          className="w-full h-48 object-cover"
          src={coverPhoto}
          alt={trip.title}
        />
      )}
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
