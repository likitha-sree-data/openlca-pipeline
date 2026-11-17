'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function OpsMap({ layers }: { layers: string[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const ready = useRef(false);

  const refresh = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const b = m.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(4)).join(',');
    fetch(`/api/ops/map?bbox=${bbox}&layers=${layersRef.current.join(',')}`)
      .then((r) => r.json()).then((d) => (m.getSource('recs') as maplibregl.GeoJSONSource | undefined)?.setData(d)).catch(() => {});
  };

  useEffect(() => {
    if (!el.current) return;
    let m: maplibregl.Map;
    try { m = new maplibregl.Map({ container: el.current, style: 'https://tiles.openfreemap.org/styles/positron', center: [-98.5, 39.2], zoom: 3.2, attributionControl: { compact: true } }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Map failed'); return; }
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    m.on('error', () => { if (!ready.current) setErr('Base map tiles could not be loaded.'); });
    m.on('load', () => {
      m.addSource('recs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 40, clusterMaxZoom: 9 });
      m.addLayer({ id: 'clusters', type: 'circle', source: 'recs', filter: ['has', 'point_count'], paint: { 'circle-color': '#3b68a8', 'circle-radius': ['step', ['get', 'point_count'], 14, 30, 18, 100, 24], 'circle-opacity': 0.9 } });
      m.addLayer({ id: 'cluster-n', type: 'symbol', source: 'recs', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 }, paint: { 'text-color': '#fff' } });
      // hollow markers are private (not published)
      m.addLayer({ id: 'pts', type: 'circle', source: 'recs', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 6, 'circle-color': ['case', ['==', ['get', 'published'], 1], ['case', ['==', ['get', 'kind'], 'Project'], '#14325c', '#c2410c'], '#ffffff'], 'circle-stroke-color': ['case', ['==', ['get', 'kind'], 'Project'], '#14325c', '#c2410c'], 'circle-stroke-width': 2 } });
      m.on('click', 'clusters', (e) => { const f = e.features?.[0]; if (f) m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: m.getZoom() + 2 }); });
      m.on('click', 'pts', (e) => {
        const p = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (!p) return;
        const box = document.createElement('div');
        const b = document.createElement('strong'); b.textContent = p.name; box.append(b, document.createElement('br'));
        const s = document.createElement('span'); s.textContent = `${p.kind} · ${p.verification} · ${Number(p.published) ? 'published' : 'private'}${p.county ? ' · ' + p.county : ''}`; box.append(s, document.createElement('br'));
        const a = document.createElement('a'); a.href = `/ops/${p.kind === 'Project' ? 'projects' : 'organizations'}/${p.id}`; a.textContent = 'Open record'; a.className = 'link'; box.append(a);
        new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setDOMContent(box).addTo(m);
      });
      ready.current = true;
      refresh();
    });
    let t: ReturnType<typeof setTimeout>;
    m.on('moveend', () => { clearTimeout(t); t = setTimeout(refresh, 250); });
    return () => { clearTimeout(t); ready.current = false; m.remove(); map.current = null; };
  }, []);

  useEffect(() => { refresh(); }, [layers.join(',')]);
  return (
    <div className="map-wrap tall" style={{ borderRadius: 16, overflow: 'hidden' }}>
      <div ref={el} className="map-el" role="region" aria-label="Map of every record on file" />
      {err && <div className="map-fallback">{err}</div>}
      <div className="map-legend">
        <h4>Marker</h4>
        <p className="tiny"><i className="sw" style={{ background: '#14325c', width: 12, height: 12 }} /> Project, published</p>
        <p className="tiny"><i className="sw" style={{ background: '#c2410c', width: 12, height: 12 }} /> Organization, published</p>
        <p className="tiny"><i className="sw" style={{ border: '2px solid #14325c', background: '#fff', width: 12, height: 12 }} /> Hollow: not published</p>
      </div>
    </div>
  );
}
