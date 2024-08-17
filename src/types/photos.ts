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
}

export interface PhotosData {
  gps_reference?: string;
  url: string;
}