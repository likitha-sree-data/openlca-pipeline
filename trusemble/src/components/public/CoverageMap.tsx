'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type Layer = { id: string; label: string; note: string };
const LAYERS: Layer[] = [
  { id: 'risk', label: 'Wildfire risk', note: 'FEMA National Risk Index, modeled; national percentile' },
  { id: 'gap', label: 'Funding gap', note: 'Top-quarter risk with no county-level wildfire award on record' },
  { id: 'federal', label: 'Federal grants committed', note: 'USAspending awards committed by county' },
  { id: 'fema', label: 'FEMA mitigation obligated', note: 'OpenFEMA hazard mitigation obligations by county' },
  { id: 'requested', label: 'Requested, not yet approved', note: 'Seeking-funding projects with an amount requested' },
  { id: 'firewise', label: 'Firewise sites', note: 'Recognized Firewise communities by county' },
];
const MAX: Record<string, number> = { federal: 5_000_000, fema: 5_000_000, requested: 2_000_000, firewise: 10 };

export default function CoverageMap() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [layer, setLayer] = useState('risk');
  const [hover, setHover] = useState('Hover a county');
  const [meta, setMeta] = useState<{ mode: string; counties: number; scored: number } | null>(null);
  const ready = useRef(false);
  const data = useRef<GeoJSON.FeatureCollection | null>(null);

  const paint = (id: string) => {
    const m = map.current;
    if (!m || !ready.current) return;
    const colour: maplibregl.ExpressionSpecification =
      id === 'risk' ? ['interpolate', ['linear'], ['coalesce', ['get', 'risk'], 0], 0, '#eef2f7', 100, '#14325c']
      : id === 'gap' ? ['case', ['==', ['get', 'gap'], 1], '#c2410c', ['>', ['get', 'awards'], 0], '#b9d3ee', '#eef2f7']
      : ['interpolate', ['linear'], ['min', 1, ['/', ['coalesce', ['get', id === 'requested' ? 'requested' : id === 'firewise' ? 'firewise' : id], 0], MAX[id]]], 0, '#eef2f7', 1, '#14325c'];
    m.setPaintProperty('fill', 'fill-color', colour);
    m.setPaintProperty('dot', 'circle-color', colour);
  };

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current, center: [-96, 38.5], zoom: 3.1, minZoom: 2, attributionControl: false, dragRotate: false, cooperativeGestures: true,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#ffffff' } }] },
    });
    map.current = m;
    m.on('load', async () => {
      m.addSource('c', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'fips' });
      m.addLayer({ id: 'fill', type: 'fill', source: 'c', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#eef2f7', 'fill-outline-color': '#ffffff' } });
      m.addLayer({ id: 'dot', type: 'circle', source: 'c', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 8, 'circle-color': '#eef2f7', 'circle-stroke-color': '#c9d2de', 'circle-stroke-width': 1, 'circle-opacity': 0.9 } });
      const over = (e: maplibregl.MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties as Record<string, string | number> | undefined;
        if (p) setHover(`${p.name}${p.state ? ', ' + p.state : ''}: risk ${p.risk ?? 'n/a'} · ${p.awards} awards · $${Number(p.committed).toLocaleString('en-US')} committed`);
      };
      for (const id of ['fill', 'dot']) { m.on('mousemove', id, over); m.on('mouseleave', id, () => setHover('Hover a county')); }
      ready.current = true;
      try {
        const r = await fetch('/api/public/counties');
        const d = (await r.json()) as { mode: string; geojson: GeoJSON.FeatureCollection };
        data.current = d.geojson;
        (m.getSource('c') as maplibregl.GeoJSONSource).setData(d.geojson);
        setMeta({ mode: d.mode, counties: d.geojson.features.length, scored: d.geojson.features.filter((f) => f.properties?.risk != null).length });
      } catch { /* leave the map empty */ }
      paint('risk');
    });
    return () => { ready.current = false; m.remove(); map.current = null; };
  }, []);

  useEffect(() => paint(layer), [layer]);
  const cur = LAYERS.find((l) => l.id === layer)!;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="chips" role="group" aria-label="Coverage layer">
        {LAYERS.map((l) => <button key={l.id} type="button" className="chip" aria-pressed={layer === l.id} onClick={() => setLayer(l.id)}>{l.label}</button>)}
      </div>
      <div className="map-wrap" style={{ height: 440, background: '#fff', marginTop: 12 }}>
        <div ref={el} className="map-el" role="img" aria-label={`County map: ${cur.label}`} />
        <div className="map-legend" style={{ bottom: 10 }}><b className="tiny">{hover}</b></div>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        {meta ? `${meta.scored} of ${meta.counties} counties with a value. ` : ''}{cur.note}.
        {meta?.mode === 'points' ? ' County outlines appear after the county outlines import (npm run ingest -- tiger-counties); markers are shown until then.' : ''}
      </p>
    </div>
  );
}
