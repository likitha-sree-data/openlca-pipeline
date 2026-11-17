'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function MiniMap({ lat, lng, precision }: { lat: number; lng: number; precision: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!el.current) return;
    try {
      const zoom = precision === 'parcel' ? 14 : precision === 'area_centre' ? 11 : precision === 'community' ? 10 : 8;
      const map = new maplibregl.Map({ container: el.current, style: process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron', center: [lng, lat], zoom, attributionControl: { compact: true }, cooperativeGestures: true });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
      map.on('load', () => {
        map.addSource('pt', { type: 'geojson', data: { type: 'Point', coordinates: [lng, lat] } as GeoJSON.Point });
        if (precision && precision !== 'parcel') map.addLayer({ id: 'halo', type: 'circle', source: 'pt', paint: { 'circle-radius': precision === 'county' ? 60 : precision === 'community' ? 40 : 26, 'circle-color': '#3b68a8', 'circle-opacity': 0.18 } });
        map.addLayer({ id: 'dot', type: 'circle', source: 'pt', paint: { 'circle-radius': 6, 'circle-color': '#14325c', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      });
      map.on('error', () => setErr(true));
      return () => map.remove();
    } catch { setErr(true); }
  }, [lat, lng, precision]);
  return (
    <div className="map-wrap" style={{ height: 260, borderRadius: 18, overflow: 'hidden' }}>
      <div ref={el} className="map-el" role="img" aria-label="Map showing the project location" />
      {err && <div className="map-fallback">Map tiles could not be loaded.</div>}
    </div>
  );
}
