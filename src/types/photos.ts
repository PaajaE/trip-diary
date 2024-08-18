// types/photos.ts
export interface Photo {
  id: string;
  file: File;
  preview: string;
  gps?: {
    latitude: number;
    longitude: number;
  };
  date?: string;
  name?: string;
  note?: string;
  title?: string;
  isCoverPhoto: boolean;
}

export interface PhotosData {
  gps_reference?: string;
  url: string;
  is_cover_photo: boolean;
  name: string;
  note?: string;
  title?: string;
  date?: string;
}