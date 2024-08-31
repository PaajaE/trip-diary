import React, { useEffect, useRef } from 'react';
import Overlay from 'ol/Overlay';

/**
 * Popup component to show additional information about a trip.
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to be displayed in the popup.
 * @param {boolean} props.show - Whether the popup should be visible.
 * @param {[number, number] | null} props.coordinates - The map coordinates where the popup should be displayed.
 */
const Popup: React.FC<{
  show: boolean;
  coordinates: [number, number] | null;
  children: React.ReactNode;
}> = ({ show, coordinates, children }: { children: React.ReactNode; show: boolean; coordinates: [number, number] | null; }) => {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<Overlay | null>(null);

  useEffect(() => {
    if (!overlayRef.current && popupRef.current) {
      overlayRef.current = new Overlay({
        element: popupRef.current,
        autoPan: true
      });
    }

    if (overlayRef.current && coordinates && show) {
      overlayRef.current.setPosition(coordinates);
    } else if (overlayRef.current) {
      overlayRef.current.setPosition(undefined);
    }
  }, [show, coordinates]);

  useEffect(() => {
    console.log({show, coordinates})
    if (overlayRef.current && coordinates && show) {
      // Attach the overlay to the map
      const map = overlayRef.current.getMap();
      if (map) {
        map.addOverlay(overlayRef.current);
      }
    }
  }, [coordinates, show]);

  return (
    <div
      ref={popupRef}
      className={`popup-container ${show ? 'visible' : 'hidden'}`}
      style={{
        position: 'absolute',
        background: 'white',
        padding: '10px',
        boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.2)',
        borderRadius: '5px',
        zIndex: 999,
      }}
    >
      {children}
    </div>
  );
};

export default Popup;
