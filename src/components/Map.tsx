import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Feature from 'ol/Feature';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { XYZ } from 'ol/source';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import GeoJSON from 'ol/format/GeoJSON';

interface Trip {
  id: number;
  title: string;
  lat: number | null;
  long: number | null;
  trip_path: GeoJSON | null;
}

interface MapComponentProps {
  session: Session;
}

const MapComponent: React.FC<MapComponentProps> = ({ session }) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<Map | null>(null);

  // Initialize the map once and add the base layer
  useEffect(() => {
    if (!mapInstance.current && mapRef.current) {
      const map = new Map({
        target: mapRef.current,
        layers: [
          new TileLayer({
            source: new XYZ({
              url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            }),
          }),
        ],
        view: new View({
          center: fromLonLat([14.41, 50.08]), // Centered on Prague
          zoom: 13,
        }),
      });
      mapInstance.current = map;
    }
  }, []);

  // Fetch trips data
  useEffect(() => {
    const fetchTrips = async () => {
      const { data, error } = await supabase
        .rpc('get_user_trips', { cur_user_id: session.user.id });

      if (error) {
        console.error('Error fetching trips:', error);
      } else {
        // Parse trip_path JSON strings to GeoJSON objects
        const convertedTrips: Trip[] = data.map((trip) => ({
          ...trip,
          trip_path: trip.trip_path ? trip.trip_path : null,
        }));

        setTrips(convertedTrips);
      }
      setLoading(false);
    };

    fetchTrips();
  }, [session]);

  // Update map with vector layers for trips
  useEffect(() => {
    if (!loading && trips.length > 0 && mapInstance.current) {
      const geoJsonFormat = new GeoJSON();

      const tripFeatures = trips.map((trip) => {
        if (trip.trip_path) {
          try {
            // Transform GeoJSON data into OpenLayers features
            const feature = geoJsonFormat.readFeature(trip.trip_path, {
              featureProjection: 'EPSG:3857', // Map projection
              dataProjection: 'EPSG:4326', // GeoJSON coordinates are in EPSG:4326
            });
            return feature;
          } catch (error) {
            console.error(`Error parsing GeoJSON for trip ${trip.id}:`, error);
            return null;
          }
        } else if (trip.lat !== null && trip.long !== null) {
          // Use Point if trip_path is not available
          return new Feature({
            geometry: new Point(fromLonLat([trip.long, trip.lat])),
          });
        }
        return null;
      }).filter((feature) => feature !== null); // Filter out any null features

      const vectorSource = new VectorSource({
        features: tripFeatures as Feature[],
      });

      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: (feature) => {
          const geometry = feature.getGeometry();
          if (geometry instanceof LineString) {
            return new Style({
              stroke: new Stroke({
                color: 'blue',
                width: 3,
              }),
            });
          } else if (geometry instanceof Point) {
            return new Style({
              image: new CircleStyle({
                radius: 7,
                fill: new Fill({ color: 'black' }),
                stroke: new Stroke({ color: 'white', width: 2 }),
              }),
            });
          }
        },
      });

      mapInstance.current.addLayer(vectorLayer);
    }
  }, [trips, loading]);

  return <div ref={mapRef} style={{ width: '100%', height: '100vh' }}></div>;
};

export default MapComponent;
