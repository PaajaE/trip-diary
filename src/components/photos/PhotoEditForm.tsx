// components/PhotoEditForm.tsx
import React, { useState } from "react";
import { Photo } from "../../types/photos";

/**
 * Props for PhotoEditForm
 */
interface PhotoEditFormProps {
  photo: Photo;
  onSave: (updatedPhoto: Photo) => void;
  onCancel: () => void;
}

const PhotoEditForm: React.FC<PhotoEditFormProps> = ({
  photo,
  onSave,
  onCancel,
}) => {
  const [editedPhoto, setEditedPhoto] = useState<Photo>(photo);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-xl font-semibold mb-4">Edit Photo Details</h3>
        <div className="mb-4">
          <label className="block text-gray-700">Name:</label>
          <input
            type="text"
            value={editedPhoto.name || ""}
            onChange={(e) =>
              setEditedPhoto({ ...editedPhoto, name: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700">Note:</label>
          <textarea
            value={editedPhoto.note || ""}
            onChange={(e) =>
              setEditedPhoto({ ...editedPhoto, note: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-md"
          ></textarea>
        </div>
        <div className="mb-4">
          <label className="block text-gray-700">Date Taken:</label>
          <input
            type="text"
            value={editedPhoto.date || "Not available"}
            readOnly
            className="w-full px-3 py-2 border rounded-md bg-gray-100"
          />
        </div>
        {editedPhoto.gps && (
          <div className="mb-4">
            <label className="block text-gray-700">GPS Coordinates:</label>
            <p className="text-gray-600">
              Latitude: {editedPhoto.gps.latitude}, Longitude:{" "}
              {editedPhoto.gps.longitude}
            </p>
          </div>
        )}
        <div className="flex justify-between">
          <button
            className="px-4 py-2 bg-red-500 text-white rounded-lg"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded-lg"
            onClick={() => onSave(editedPhoto)}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhotoEditForm;
