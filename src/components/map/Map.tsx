import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { XYZ } from 'ol/source';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import GeoJSON from 'ol/format/GeoJSON';
import Popup from './Popup';
import TripCard from '../TripCard';
import { LineString } from 'ol/geom';
import { Trip } from '../../types/trip';

interface MapComponentProps {
  session: Session;
}

const MapComponent: React.FC<MapComponentProps> = ({ session }) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<Map | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [popupCoordinates, setPopupCoordinates] = useState<[number, number] | null>(null);

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
          projection: 'EPSG:4326',
        }),
      });

      mapInstance.current = map;
    }
  }, []);

  // Fetch trips data
  useEffect(() => {
    const fetchTrips = async () => {
      const { data, error } = await supabase.rpc('get_user_trips', { cur_user_id: session.user.id });
      console.log({ data })

      if (error) {
        console.error('Error fetching trips:', error);
      } else {
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

      const tripFeatures = trips
        .map((trip) => {
          if (trip.trip_path) {
            try {
              // Transform GeoJSON data into OpenLayers features
              const feature = geoJsonFormat.readFeature(trip.trip_path, {
                featureProjection: 'EPSG:3857', // Map projection
                dataProjection: 'EPSG:4326', // GeoJSON coordinates are in EPSG:4326
              });
              feature.set('tripData', trip);
              return feature;
            } catch (error) {
              console.error(`Error parsing GeoJSON for trip ${trip.id}:`, error);
              return null;
            }
          } else if (trip.lat && trip.long) {
            const feature = new Feature({
              geometry: new Point(fromLonLat([trip.long, trip.lat])),
            });
            feature.set('tripData', trip);
            return feature;
          }
          return null;
        })
        .filter((feature) => feature !== null); // Filter out any null features

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

      // Add click event listener
      mapInstance.current.on('singleclick', (event) => {
        let foundFeature = false;

        mapInstance.current?.forEachFeatureAtPixel(event.pixel, (feature) => {
          const trip = feature.get('tripData') as Trip;
          console.log({ trip })
          console.log({ event })
          if (trip) {
            // Prevent unnecessary re-renders if the same trip is clicked again
            // if (selectedTrip?.id !== trip.id) {
            setSelectedTrip(trip);
            setPopupCoordinates(event.coordinate as [number, number]);
            // }
            foundFeature = true;
          }
        });

        // Hide popup if clicking on an empty area
        if (!foundFeature) {
          setSelectedTrip(null);
          setPopupCoordinates(null);
        }
      });
    }
  }, [trips, loading, selectedTrip]);

  useEffect(() => {
    console.log({ selectedTrip })
  }, [selectedTrip])

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100vh' }}>
      <Popup show={!!selectedTrip} coordinates={popupCoordinates}>
        {selectedTrip && <TripCard trip={selectedTrip} />}
      </Popup>
    </div>
  );
};

export default MapComponent;
