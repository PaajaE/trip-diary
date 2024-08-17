// components/PhotoUpload.tsx
import React, { useState } from "react";
import exifr from "exifr";
import { v4 as uuidv4 } from "uuid";
import PhotoEditForm from "./PhotoEditForm";
import PencilIcon from "../icons/PencilIcon";
import TrashIcon from "../icons/TrashIcon";
import UploadIcon from "../icons/UploadIcon";
import CloseIcon from "../icons/CloseIcon";
import { Photo } from "../../types/photos";

interface PhotoUploadProps {
  onClose: () => void;
  onSave: (photos: Photo[]) => void;
}

/**
 * A component for uploading and managing photos.
 * Allows users to upload, edit, and delete photos, and to confirm the upload.
 *
 * @component
 * @example
 * const handleSave = (photos: Photo[]) => {
 *   console.log("Uploaded photos:", photos);
 * };
 * const handleClose = () => {
 *   console.log("Close upload modal");
 * };
 * return (
 *   <PhotoUpload onClose={handleClose} onSave={handleSave} />
 * )
 */
const PhotoUpload: React.FC<PhotoUploadProps> = ({ onClose, onSave }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const newPhotos: Photo[] = [];

    console.log({ files })

    for await (const file of files) {
      const preview = URL.createObjectURL(file);
      const photo: Photo = { id: uuidv4(), file, preview };
      await extractMetadata(photo);
      newPhotos.push(photo);
    }

    setPhotos((prev) => [...prev, ...newPhotos]);
  };

  const extractMetadata = async (photo: Photo) => {
    const output = await exifr.parse(photo.preview, ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude'])
    console.log({ output })

    const dateTaken = output.DateTimeOriginal
    const gpsLatitude = output.GPSLatitude
    const gpsLongitude = output.GPSLongitude

    if (gpsLatitude && gpsLongitude) {
      photo.gps = {
        latitude: gpsLatitude[0] + gpsLatitude[1] / 60 + gpsLatitude[2] / 3600,
        longitude: gpsLongitude[0] + gpsLongitude[1] / 60 + gpsLongitude[2] / 3600,
      };
    }


    if (dateTaken) {
      photo.date = dateTaken;
    }

    console.log({ photo })

    setPhotos((prev) =>
      prev.map((p) => (p.id === photo.id ? { ...p, ...photo } : p))
    );
  };

  const editPhoto = (photo: Photo) => {
    setSelectedPhoto(photo);
    setIsEditing(true);
  };

  const saveEditedPhoto = (updatedPhoto: Photo) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p))
    );
    setIsEditing(false);
    setSelectedPhoto(null);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpload = () => {
    onSave(photos);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="relative w-full max-w-4xl p-4 mx-4 my-6 bg-white rounded-lg shadow-lg md:mx-auto">
        {/* Close button */}
        <button
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-900"
          onClick={onClose}
        >
          <CloseIcon className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-semibold mb-4 text-center">Upload Your Photos</h2>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.heic"
          multiple
          className="mb-4 cursor-pointer block w-full"
          onChange={handleFileChange}
        />
        <div className="flex flex-wrap gap-4 mb-4">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group">
              <img
                src={photo.preview}
                alt="Selected"
                className="w-32 h-32 object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="text-white mx-2"
                  onClick={() => editPhoto(photo)}
                >
                  <PencilIcon className="w-6 h-6" />
                </button>
                <button
                  className="text-white mx-2"
                  onClick={() => removePhoto(photo.id)}
                >
                  <TrashIcon className="w-6 h-6" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 w-full"
          onClick={handleUpload}
        >
          <UploadIcon className="w-5 h-5 inline-block mr-2" />
          Confirm Upload
        </button>

        {isEditing && selectedPhoto && (
          <PhotoEditForm
            photo={selectedPhoto}
            onSave={saveEditedPhoto}
            onCancel={() => {
              setIsEditing(false);
              setSelectedPhoto(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default PhotoUpload;
