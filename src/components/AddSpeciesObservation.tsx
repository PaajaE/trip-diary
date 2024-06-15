import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { addSpeciesObservation } from '../functions/addSpeciesObservation';
import { supabase } from '../supabaseClient';

/**
 * AddSpeciesObservation component for adding a new species observation.
 * @returns {JSX.Element} The species observation form component.
 */
const AddSpeciesObservation: React.FC = (): JSX.Element => {
  const [speciesName, setSpeciesName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);

  const { tripId } = useParams();
  const tripIdNumber = Number(tripId);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };

    fetchUser();
  }, []);

  /**
 * Handles uploading a photo to Supabase Storage and returns the public URL.
 * @param {File} file - The photo file to upload.
 * @returns {Promise<string>} The URL of the uploaded photo.
 * @throws {Error} If the upload fails.
 */
  const handleFileUpload = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`; // Ensure unique file name.
    const { data, error } = await supabase.storage.from('photos').upload(`public/${tripId}/${fileName}`, file);

    if (error) {
      throw new Error('Failed to upload photo: ' + error.message);
    }

    // Assuming the file was uploaded successfully, retrieve the public URL.
    if (data) {

      const { data: urlData } = supabase.storage.from('gpx-files').getPublicUrl(`public/${tripId}/${fileName}`);
      const { publicUrl } = urlData

      if (!publicUrl) {
        throw new Error('Failed to get public URL for the uploaded file.');
      }
      return publicUrl;
    }
    throw new Error('Failed to upload photo');
  };


  /**
   * Handles the species observation form submission.
   * @param {React.FormEvent} e The form event.
   */
  const handleAddObservation = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!userId) {
      setError('You need to be logged in to add an observation.');
      return;
    }

    let photoUrl = '';
    if (photoFile) {
      try {
        photoUrl = await handleFileUpload(photoFile); // Get the public URL directly
      } catch (uploadError) {
        if (uploadError instanceof Error) {
          setError(uploadError.message);
          return;
        }
        setError('An unknown error occurred during file upload.');
        return;
      }
    }

    const observationData = { species_name: speciesName, description, photo_url: photoUrl, category, trip_id: tripIdNumber };

    try {
      const data = await addSpeciesObservation(observationData, userId);
      console.log({ data });
      setMessage('Observation added successfully!');
      setSpeciesName('');
      setDescription('');
      setPhotoFile(null);
      setCategory('');
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError('Error adding observation: ' + error.message);
      } else {
        setError('An unknown error occurred.');
      }
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white shadow-md rounded-lg p-8">
        <h2 className="text-2xl font-bold mb-6 text-center">Add Species Observation</h2>
        {error && <div className="bg-red-100 text-red-700 p-2 mb-4 rounded">{error}</div>}
        {message && <div className="bg-green-100 text-green-700 p-2 mb-4 rounded">{message}</div>}
        <form onSubmit={handleAddObservation}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="speciesName">Species Name</label>
            <input
              type="text"
              id="speciesName"
              value={speciesName}
              onChange={(e) => setSpeciesName(e.target.value)}
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
            <label className="block text-gray-700 mb-2" htmlFor="photoFile">Photo</label>
            <input
              type="file"
              id="photoFile"
              onChange={(e) => setPhotoFile(e.target.files ? e.target.files[0] : null)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="category">Category</label>
            <input
              type="text"
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition duration-200"
          >
            Add Observation
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddSpeciesObservation;
