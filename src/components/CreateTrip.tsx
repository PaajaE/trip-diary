import React, { useState } from 'react';
import { createTrip } from '../functions/createTrip';
import { supabase } from '../supabaseClient';
import { Session } from '@supabase/supabase-js';
import { formatGeographyPoint } from '../utils/map';
import UploadPhotos from './photos/PhotoUpload'; // Import the UploadPhotos component
import { Photo, PhotosData } from '../types/photos';
import { uploadSinglePhoto } from '../functions/uploadPhotos';

const CreateTrip: React.FC<{ session: Session }> = ({ session }) => {
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpsReference, setGpsReference] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isUploadPhotosOpen, setIsUploadPhotosOpen] = useState<boolean>(false);
  // const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState<boolean>(false); // Track photo upload status
  const [photosUploaded, setPhotosUploaded] = useState<boolean>(false); // Track if photos have been uploaded
  const [uploadedPhotosData, setUploadedPhotosData] = useState<PhotosData[]>([]); // Track if photos have been uploaded

  const handleFileUpload = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const { data, error } = await supabase.storage.from('gpx-files').upload(fileName, file);

    if (error) {
      throw new Error('Failed to upload GPX file: ' + error.message);
    }

    if (data) {
      const { data: urlData } = supabase.storage.from('gpx-files').getPublicUrl(data.path);
      const { publicUrl } = urlData;

      if (!publicUrl) {
        throw new Error('Failed to get public URL for the uploaded file.');
      }

      return publicUrl;
    }

    throw new Error('Failed to upload GPX file: No data returned');
  };

  async function handlePhotoUpload(photos: Photo[]) {
    setIsUploadPhotosOpen(false);
    setIsUploadingPhotos(true); // Start showing the loading indicator
    setPhotosUploaded(false); // Reset the photo upload state

    if (!session.user.id) {
      setError('You need to be logged in to create a trip.');
      return;
    }

    try {
      const uploadPromises = photos.map(async (photo) => {
        const url = await uploadSinglePhoto(photo, session.user.id);
        let gps_reference;

        // If GPS coordinates are available, format them as a point type
        if (photo.gps?.latitude && photo.gps?.longitude) {
          gps_reference = `POINT(${photo.gps.longitude} ${photo.gps.latitude})`
        }

        return { url, gps_reference };
      });

      const uploadedPhotos = await Promise.all(uploadPromises);

      // Store the uploaded photo data (including URLs and GPS references)
      // setUploadedPhotoUrls(uploadedPhotos.map((photo) => photo.url));
      setUploadedPhotosData(uploadedPhotos); // Save full photo data for later use in the createTrip function
      setPhotosUploaded(true);
    } catch (error) {
      console.error('Photo upload failed:', error);
      setError('Failed to upload photos.');
    } finally {
      setIsUploadingPhotos(false); // Stop the loading indicator
    }
  }

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
      const data = await createTrip(tripData, session.user.id, tagsArray, uploadedPhotosData);
      console.log({ data });
      setMessage('Trip created successfully!');
      setTitle('');
      setDescription('');
      setGpsReference('');
      setGpxFile(null);
      setTags('');
      // setUploadedPhotoUrls([]);
      setPhotosUploaded(false); // Reset the photo upload state after creating the trip
      setUploadedPhotosData([]);
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
          <div className="mb-4">
            <button
              type="button"
              className="w-full bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition duration-200 mb-4"
              onClick={() => setIsUploadPhotosOpen(true)}
            >
              Upload Photos
            </button>
          </div>
          {/* Show loading indicator if photos are being uploaded */}
          {isUploadingPhotos && <div className="text-blue-500 text-center mb-4">Uploading photos...</div>}
          {/* Disable the Create Trip button until photos are uploaded */}
          <button
            type="submit"
            className={`w-full py-2 rounded-lg transition duration-200 ${
              photosUploaded ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
            disabled={!photosUploaded}
          >
            Create Trip
          </button>
        </form>
      </div>

      {isUploadPhotosOpen && (
        <UploadPhotos
          onClose={() => setIsUploadPhotosOpen(false)}
          onSave={handlePhotoUpload}
        />
      )}
    </div>
  );
};

export default CreateTrip;
