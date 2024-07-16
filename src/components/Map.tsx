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
import { supabase } from '../supabaseClient';

interface Trip {
  id: number;
  lat: number;
  long: number;
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
              url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            })
          })
        ],
        view: new View({
          center: fromLonLat([14.41, 50.08]),
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
        .rpc('get_user_trips', { user_id: session.user.id });

      if (error) {
        console.error('Error fetching trips:', error);
      } else {
        setTrips(data);
      }
      setLoading(false);
    };

    fetchTrips();
  }, [session]);

  // Update map with vector layer for trips
  useEffect(() => {
    if (!loading && trips.length > 0 && mapInstance.current) {
      const tripFeatures = trips.map(trip => new Feature({
        geometry: new Point(fromLonLat([trip.long, trip.lat]))
      }));

      const vectorSource = new VectorSource({
        features: tripFeatures
      });

      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: 'black' }),
            stroke: new Stroke({ color: 'white', width: 2 })
          })
        })
      });

      mapInstance.current.addLayer(vectorLayer);
    }
  }, [trips, loading]);

  return <div ref={mapRef} style={{ width: '100%', height: '100vh' }}></div>;
};

export default MapComponent;
