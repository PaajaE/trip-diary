import GeoJSON from "ol/format/GeoJSON";

type TripPhoto = {
  name?: string | null;
  signedUrl?: string;
  is_cover_photo?: boolean;
};

export type Trip = {
  id: number;
  created_at?: string | null;
  title: string;
  description?: string | null;
  gps_reference?: unknown | null;
  lat?: number | null;
  long?: number | null;
  photos?: TripPhoto[];
  trip_path?: GeoJSON | null;
  coverPhoto?: TripPhoto;
};