import { supabase } from "../supabaseClient";
import { Photo } from "../types/photos";

/**
 * Uploads an array of photos to Supabase storage.
 * @param {Photo[]} photos - An array of photos to be uploaded.
 * @returns {Promise<string[]>} A promise that resolves to an array of URLs for the uploaded photos.
 */
async function uploadPhotos(photos: Photo[], userId: string): Promise<string[]> {
  const uploadedPhotoUrls: string[] = [];

  for (const photo of photos) {
    try {
      const fileName = `${userId}/${photo.id}-${photo.file.name}`;
      const { data, error } = await supabase.storage
        .from('trip-photos')
        .upload(`${fileName}`, photo.file);

      if (error) {
        console.error('Error uploading photo:', error.message);
        throw new Error(`Failed to upload photo: ${photo.file.name}`);
      }

      if (data) {
        // Get the public URL of the uploaded photo
        const { data: publicUrlData } = supabase.storage
          .from('trip-photos')
          .getPublicUrl(`photos/${fileName}`);

        if (publicUrlData) {
          uploadedPhotoUrls.push(publicUrlData.publicUrl);
        }
      }
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  }

  return uploadedPhotoUrls;
}

export default uploadPhotos

/**
 * Uploads a single photo and returns the URL.
 * @param {Photo} photo - The photo object to upload.
 * @param {string} userId - The user's ID.
 * @returns {Promise<string>} The URL of the uploaded photo.
 */
export async function uploadSinglePhoto(photo: Photo, userId: string): Promise<string> {
  const fileName = `${userId}/${photo.id}-${photo.file.name}`;
  const { data, error } = await supabase.storage
    .from('trip-photos')
    .upload(fileName, photo.file);

  if (error) {
    throw new Error(`Failed to upload photo: ${photo.file.name} - ${error.message}`);
  }

  console.log({ data })

  const { publicUrl } = supabase.storage
    .from('trip-photos')
    .getPublicUrl(fileName).data;

  return publicUrl;
}
