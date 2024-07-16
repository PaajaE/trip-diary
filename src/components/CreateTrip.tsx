import React, { useState } from 'react';
import { createTrip } from '../functions/createTrip';
import { supabase } from '../supabaseClient';
import { Session } from '@supabase/supabase-js';
import { formatGeographyPoint } from '../utils/map';

/**
 * Component for creating new trips.
 * Allows users to input trip details, upload a GPX file, and add tags related to the trip.
 * It also handles user authentication state to ensure that trips are associated with a logged-in user.
 *
 * @component
 * @example
 * return (
 *   <CreateTrip />
 * )
 */
const CreateTrip: React.FC<{session: Session}> = ({session}): JSX.Element => {
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpsReference, setGpsReference] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  /**
 * Handles uploading a GPX file to Supabase Storage and returns the file URL.
 * @param {File} file - The GPX file to upload.
 * @returns {Promise<string>} The URL of the uploaded file.
 * @throws {Error} If the upload fails.
 */
  const handleFileUpload = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const { data, error } = await supabase.storage.from('gpx-files').upload(fileName, file);

    if (error) {
      throw new Error('Failed to upload GPX file: ' + error.message);
    }

    // Assuming the file was uploaded successfully, retrieve the public URL.
    if (data) {
      const { data: urlData } = supabase.storage.from('gpx-files').getPublicUrl(data.path);
      const { publicUrl } = urlData

      if (!publicUrl) {
        throw new Error('Failed to get public URL for the uploaded file.');
      }

      return publicUrl; // Returns the public URL directly
    }

    throw new Error('Failed to upload GPX file: No data returned');
  };


  /**
   * Handles form submission for creating a new trip.
   * Uploads the GPX file, if available, and creates a new trip record with the specified details.
   *
   * @param {React.FormEvent} e - The event object for the form submission.
   */
  const handleCreateTrip = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!session.user.id) {
      setError('You need to be logged in to create a trip.');
      return;
    }

    let gpxUrl = null;
    if (gpxFile) {
      try {
        gpxUrl = await handleFileUpload(gpxFile);
      } catch (uploadError: unknown) {
        if (uploadError instanceof Error) {
          setError(uploadError.message);
        } else {
          setError('An unknown error occurred during file upload.');
        }
        return;
      }
    }

    const tripData = { title, description, gps_reference: formatGeographyPoint(gpsReference), gpx_file: gpxUrl };
    const tagsArray = tags.split(',').map(tag => tag.trim());

    try {
      const data = await createTrip(tripData, session.user.id, tagsArray);
      console.log({ data })
      setMessage('Trip created successfully!');
      setTitle('');
      setDescription('');
      setGpsReference('');
      setGpxFile(null);
      setTags('');
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError('Error creating trip: ' + error.message);
      } else {
        setError('An unknown error occurred.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8">
        <h2 className="text-2xl font-bold mb-6 text-center">Create Trip</h2>
        {error && <div className="bg-red-100 text-red-700 p-2 mb-4 rounded">{error}</div>}
        {message && <div className="bg-green-100 text-green-700 p-2 mb-4 rounded">{message}</div>}
        <form onSubmit={handleCreateTrip}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="title">Title</label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="gpsReference">GPS reference</label>
            <input
              type="text"
              id="gpsReference"
              value={gpsReference}
              onChange={(e) => setGpsReference(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="gpxFile">GPX File</label>
            <input
              type="file"
              id="gpxFile"
              onChange={(e) => setGpxFile(e.target.files ? e.target.files[0] : null)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="tags">Tags (comma separated)</label>
            <input
              type="text"
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition duration-200"
          >
            Create Trip
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateTrip;
