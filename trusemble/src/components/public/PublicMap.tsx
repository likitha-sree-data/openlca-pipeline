'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers, Search } from 'lucide-react';

type Filters = { q: string; category: string; stage: string; state: string; county: string };
type ListResp = {
  total: number; onMap: number; notOnMap: number; stages: Record<string, number>;
  items: { id: number; name: string; stage: string; county: string | null; state: string | null; owner: string | null }[];
};
type CountyResp = { mode: 'polygons' | 'points'; riskCutoff: number | null; gapCount: number; geojson: GeoJSON.FeatureCollection };

export type MapProps = {
  variant: 'hero' | 'full';
  categories: [string, string][];
  stages: [string, string][];
  options: { states: string[]; counties: { county: string; state: string }[] };
  counts: { projects: number; recipients: number; communities: number; agencies: number; partners: number; counties: number };
  initial?: Partial<Filters> & { layers?: string[] };
  pageSize?: number;
};

const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron';
// ?basemap=blank draws the data layers on a plain background: no tile requests, handy offline and for print.
const styleUrl = () => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('basemap') === 'blank' ? '/blank-style.json' : STYLE);
const STAGE_COLOR: Record<string, string> = { seeking_funding: '#c8412f', funded: '#2c7bb6', in_progress: '#2f8559', planning: '#8a6bbf', complete: '#14583b' };
const ORG_COLOR: Record<string, string> = { recipients: '#2f8559', communities: '#e0933a', agencies: '#3b6fb0', partners: '#7a52a8' };
const ORG_LAYERS = ['recipients', 'communities', 'agencies', 'partners'] as const;
const COUNTY_LAYERS = ['counties', 'risk', 'gap'] as const;
const stageLabel = (s: string, stages: [string, string][]) => stages.find((x) => x[0] === s)?.[1] ?? s;

export default function PublicMap(props: MapProps) {
  const { variant, categories, stages, options, counts, pageSize = 50 } = props;
  const full = variant === 'full';
  const [filters, setFilters] = useState<Filters>({ q: '', category: '', stage: '', state: '', county: '', ...props.initial });
  const [showFilters, setShowFilters] = useState(false);
  const [layers, setLayers] = useState<string[]>(props.initial?.layers?.length ? props.initial.layers : ['projects']);
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<ListResp | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hover, setHover] = useState<string>('');
  const [counties, setCounties] = useState<CountyResp | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const filtersRef = useRef(filters);
  const layersRef = useRef(layers);
  filtersRef.current = filters;
  layersRef.current = layers;

  const qs = useCallback((f: Filters, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v);
    return p.toString();
  }, []);

  // ----- list panel
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/public/projects?${qs(filters, { limit: String(pageSize), offset: String(offset) })}`, { signal: ctl.signal })
        .then((r) => r.json()).then(setList).catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [filters, offset, pageSize, qs]);

  // ----- map data refresh
  const refresh = useCallback(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(4)).join(',');
    const zoom = Math.round(map.getZoom());
    const active = layersRef.current;
    const set = (id: string, data: GeoJSON.FeatureCollection) => (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

    if (active.includes('projects')) {
      fetch(`/api/public/map?${qs(filtersRef.current, { layer: 'projects', bbox, zoom: String(zoom) })}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: { kind: 'grid' | 'points'; geojson: GeoJSON.FeatureCollection }) => {
          set('grid', d.kind === 'grid' ? d.geojson : empty);
          set('points', d.kind === 'points' ? d.geojson : empty);
        }).catch(() => {});
    } else { set('grid', empty); set('points', empty); }

    const orgActive = ORG_LAYERS.filter((l) => active.includes(l));
    const all: GeoJSON.Feature[] = [];
    Promise.all(orgActive.map((l) =>
      fetch(`/api/public/map?layer=${l}&bbox=${bbox}&zoom=${zoom}`, { signal: ctl.signal }).then((r) => r.json())
        .then((d: { geojson: GeoJSON.FeatureCollection }) => { for (const f of d.geojson.features) all.push({ ...f, properties: { ...f.properties, layer: l } }); }),
    )).then(() => set('orgs', { type: 'FeatureCollection', features: all })).catch(() => {});
  }, [qs]);

  // ----- counties
  useEffect(() => {
    if (!layers.some((l) => (COUNTY_LAYERS as readonly string[]).includes(l)) || counties) return;
    fetch('/api/public/counties').then((r) => r.json()).then(setCounties).catch(() => {});
  }, [layers, counties]);

  // ----- create map once
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: el.current, style: styleUrl(), center: [-98.5, 39.2], zoom: 3.1, minZoom: 2, maxZoom: 16,
        attributionControl: { compact: true }, cooperativeGestures: !full,
      });
    } catch (e) {
      setMapError(e instanceof Error ? e.message : 'The map could not start.');
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.on('error', (e) => { if (!ready.current && e.error && /style|fetch|network/i.test(String(e.error.message))) setMapError('Base map tiles could not be loaded. Records are still listed below.'); });
    map.on('load', () => {
      const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
      for (const id of ['counties', 'grid', 'points', 'orgs']) map.addSource(id, { type: 'geojson', data: empty, promoteId: id === 'counties' ? 'fips' : undefined });
      map.addLayer({ id: 'counties-fill', type: 'fill', source: 'counties', filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility: 'none' }, paint: { 'fill-color': '#f2f5f2', 'fill-opacity': 0.8 } });
      map.addLayer({ id: 'counties-line', type: 'line', source: 'counties', filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility: 'none' }, paint: { 'line-color': '#ffffff', 'line-width': 0.4 } });
      map.addLayer({ id: 'counties-dot', type: 'circle', source: 'counties', filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none' }, paint: { 'circle-radius': 9, 'circle-color': '#f2f5f2', 'circle-opacity': 0.85, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'grid-fill', type: 'fill', source: 'grid', paint: { 'fill-color': ['match', ['get', 'bucket'], 1, '#d6e8dd', 3, '#a8d0b9', 10, '#6cae8a', 30, '#2e8458', 100, '#14583b', '#d6e8dd'], 'fill-opacity': 0.92 } });
      map.addLayer({ id: 'points-dot', type: 'circle', source: 'points', paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'stage'], 'seeking_funding', STAGE_COLOR.seeking_funding, 'funded', STAGE_COLOR.funded, 'in_progress', STAGE_COLOR.in_progress, 'planning', STAGE_COLOR.planning, STAGE_COLOR.complete], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'orgs-dot', type: 'circle', source: 'orgs', paint: { 'circle-radius': 5, 'circle-color': ['match', ['get', 'layer'], 'recipients', ORG_COLOR.recipients, 'communities', ORG_COLOR.communities, 'agencies', ORG_COLOR.agencies, ORG_COLOR.partners], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });

      map.on('click', 'grid-fill', (e) => map.easeTo({ center: e.lngLat, zoom: Math.min(16, map.getZoom() + 2) }));
      const popup = (e: maplibregl.MapLayerMouseEvent, link: boolean) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        const box = document.createElement('div');
        const b = document.createElement('strong'); b.textContent = p.name; box.append(b, document.createElement('br'));
        const s = document.createElement('span'); s.textContent = [p.stage ? p.stage.replace(/_/g, ' ') : p.type?.replace(/_/g, ' '), p.county].filter(Boolean).join(' · '); box.append(s);
        if (link) { box.append(document.createElement('br')); const a = document.createElement('a'); a.href = `/projects/${p.id}`; a.textContent = 'Open project'; a.className = 'link'; box.append(a); }
        new maplibregl.Popup({ closeButton: false, offset: 8 }).setLngLat(e.lngLat).setDOMContent(box).addTo(map);
      };
      map.on('click', 'points-dot', (e) => popup(e, true));
      map.on('click', 'orgs-dot', (e) => popup(e, false));
      for (const id of ['grid-fill', 'points-dot', 'orgs-dot']) {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
      }
      const countyHover = (e: maplibregl.MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties as Record<string, number | string | null> | undefined;
        if (!p) return;
        const money = Number(p.committed) ? `, $${Number(p.committed).toLocaleString('en-US')} committed` : '';
        setHover(`${p.name}${p.state ? ', ' + p.state : ''}: risk ${p.risk ?? 'n/a'}, ${p.awards} award${Number(p.awards) === 1 ? '' : 's'}${money}`);
      };
      for (const id of ['counties-fill', 'counties-dot']) {
        map.on('mousemove', id, countyHover);
        map.on('mouseleave', id, () => setHover(''));
      }
      ready.current = true;
      refresh();
    });
    let t: ReturnType<typeof setTimeout>;
    map.on('moveend', () => { clearTimeout(t); t = setTimeout(refresh, 250); });
    return () => { clearTimeout(t); abort.current?.abort(); ready.current = false; map.remove(); mapRef.current = null; };
  }, [full, refresh]);

  // re-fetch on filter or layer change
  useEffect(() => { refresh(); }, [filters, layers, refresh]);

  // apply county data and styling
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const apply = () => {
      const active = COUNTY_LAYERS.filter((l) => layers.includes(l));
      const vis = active.length ? 'visible' : 'none';
      for (const id of ['counties-fill', 'counties-line', 'counties-dot']) map.setLayoutProperty(id, 'visibility', vis);
      if (counties) (map.getSource('counties') as maplibregl.GeoJSONSource).setData(counties.geojson);
      const gap = layers.includes('gap');
      const risk = layers.includes('risk');
      const riskColor: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['coalesce', ['get', 'risk'], 0], 0, '#f1f5f1', 50, '#8fbba4', 100, '#1c4d3c'];
      const gapColor: maplibregl.ExpressionSpecification = ['case', ['==', ['get', 'gap'], 1], '#c8412f', ['>', ['get', 'awards'], 0], '#b9dcc9', '#eef2ee'];
      const color = gap ? gapColor : risk ? riskColor : '#eef2ee';
      map.setPaintProperty('counties-fill', 'fill-color', color);
      map.setPaintProperty('counties-dot', 'circle-color', color);
    };
    apply();
  }, [layers, counties]);

  const toggle = (id: string) =>
    setLayers((cur) => {
      const has = cur.includes(id);
      let next = has ? cur.filter((x) => x !== id) : [...cur, id];
      if (!has && (COUNTY_LAYERS as readonly string[]).includes(id)) next = next.filter((x) => x === id || !(COUNTY_LAYERS as readonly string[]).includes(x));
      return next;
    });

  const setF = (patch: Partial<Filters>) => { setOffset(0); setFilters((f) => ({ ...f, ...patch })); };
  const countyOpts = useMemo(() => options.counties.filter((c) => !filters.state || c.state === filters.state), [options.counties, filters.state]);
  const layerChips: { id: string; label: string; n?: number }[] = [
    { id: 'projects', label: 'Projects', n: counts.projects },
    { id: 'recipients', label: 'Funding recipients', n: counts.recipients },
    { id: 'communities', label: 'Communities', n: counts.communities },
    { id: 'agencies', label: 'Agencies and districts', n: counts.agencies },
    { id: 'partners', label: 'Partners and crews', n: counts.partners },
    { id: 'counties', label: 'Counties' },
    { id: 'risk', label: 'Wildfire risk' },
    { id: 'gap', label: 'Funding gap' },
  ];
  const gapOn = layers.includes('gap');
  const stageEntries = stages.map(([k, l]) => ({ k, l, n: list?.stages[k] ?? 0 }));
  const from = list ? Math.min(list.total, offset + 1) : 0;
  const to = list ? Math.min(list.total, offset + pageSize) : 0;

  return (
    <div className="map-card" data-testid="public-map">
      {!full && (
        <div className="map-top" style={{ borderBottom: 0, paddingBottom: 0, color: 'var(--muted)', justifyContent: 'space-between' }}>
          <span className="small">Live map · United States</span>
          <a className="link small" href="/projects">Open full map</a>
        </div>
      )}
      <div className="map-top">
        <label className="sr-only" htmlFor={`q-${variant}`}>Search projects</label>
        <div className="search" style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--muted)' }} aria-hidden />
          <input id={`q-${variant}`} className="input" style={{ paddingLeft: 34, width: '100%' }} placeholder="Search projects" value={filters.q} onChange={(e) => setF({ q: e.target.value })} />
        </div>
        {full && (
          <select className="select" aria-label="Category" value={filters.category} onChange={(e) => setF({ category: e.target.value })}>
            <option value="">All categories</option>
            {categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        <button type="button" className="btn sm" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>Filters</button>
      </div>
      {showFilters && (
        <div className="map-top">
          {!full && (
            <select className="select" aria-label="Category" value={filters.category} onChange={(e) => setF({ category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          <select className="select" aria-label="Stage" value={filters.stage} onChange={(e) => setF({ stage: e.target.value })}>
            <option value="">Any stage</option>
            {stages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="select" aria-label="State" value={filters.state} onChange={(e) => setF({ state: e.target.value, county: '' })}>
            <option value="">Any state</option>
            {options.states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" aria-label="County" value={filters.county} onChange={(e) => setF({ county: e.target.value })}>
            <option value="">Any county</option>
            {countyOpts.map((c) => <option key={c.state + c.county} value={c.county}>{c.county}, {c.state}</option>)}
          </select>
          <button type="button" className="btn sm ghost" onClick={() => setF({ q: '', category: '', stage: '', state: '', county: '' })}>Clear</button>
        </div>
      )}
      {full && (
        <div className="map-top" style={{ borderTop: 0 }}>
          <div className="chips" role="group" aria-label="Map layers">
            {layerChips.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={layers.includes(c.id)} onClick={() => toggle(c.id)}>
                {c.label}{c.n !== undefined && <span className="n">{c.n.toLocaleString('en-US')}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`map-wrap${full ? ' tall' : ''}`}>
        <div ref={el} className="map-el" role="region" aria-label="Map of wildfire mitigation projects" />
        {mapError && <div className="map-fallback">{mapError}</div>}
        {!full && (
          <details className="map-layers">
            <summary><Layers size={16} aria-hidden /> Layers {layers.length}</summary>
            <div className="panel">
              {layerChips.map((c) => (
                <label key={c.id} className="check small">
                  <input type="checkbox" checked={layers.includes(c.id)} onChange={() => toggle(c.id)} /> {c.label}
                </label>
              ))}
            </div>
          </details>
        )}
        <div className="map-legend" aria-live="polite">
          {layers.includes('projects') && (
            <>
              <h4>Records per square</h4>
              <div className="scale">
                {[['1', '#d6e8dd'], ['3', '#a8d0b9'], ['10', '#6cae8a'], ['30', '#2e8458'], ['100+', '#14583b']].map(([l, c]) => (
                  <span key={l} className="tiny" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className="sw" style={{ background: c }} />{l}</span>
                ))}
              </div>
              <p className="tiny muted">Zoom in or tap a square to see each place.</p>
            </>
          )}
          {gapOn && (
            <div style={{ marginTop: layers.includes('projects') ? 8 : 0 }}>
              <h4>Funding gap</h4>
              <p className="tiny"><i className="sw" style={{ background: '#c8412f', width: 12, height: 12 }} /> Top-quarter risk, no award on record</p>
              <p className="tiny"><i className="sw" style={{ background: '#b9dcc9', width: 12, height: 12 }} /> At least one wildfire award</p>
              <p className="tiny muted">County-level awards from USAspending and FEMA. Statewide grants are not placed in a county.{counties ? ` ${counties.gapCount} counties in the gap.` : ''}</p>
            </div>
          )}
          {layers.includes('risk') && !gapOn && <p className="tiny muted">Darker counties have higher FEMA wildfire risk scores.</p>}
          {hover && <p className="tiny" style={{ marginTop: 6, fontWeight: 600 }}>{hover}</p>}
        </div>
      </div>
      <div style={{ padding: '14px 18px 0' }}>
        <b className="num" style={{ fontSize: 28 }}>{list ? list.total.toLocaleString('en-US') : '…'}</b>{' '}
        <span className="muted small">projects{list ? `, ${list.onMap.toLocaleString('en-US')} on the map` : ''}</span>
      </div>
      <div className="stage-line" aria-label="Projects by stage">
        {stageEntries.map((s) => <span key={s.k}>{s.l} <b className="num">{s.n.toLocaleString('en-US')}</b></span>)}
      </div>
      <p className="tiny muted" style={{ padding: '0 18px 8px' }}>Not yet checked: these come from public records and the TruSemble team has not checked them yet.</p>
      <div className="list-panel" tabIndex={0} aria-label="Matching projects">
        {list?.items.map((p) => (
          <a key={p.id} className="list-item" href={`/projects/${p.id}`}>
            <b>{p.name}</b>
            <span>{stageLabel(p.stage, stages)}{p.county ? ` · ${p.county}` : ''}</span>
          </a>
        ))}
        {list && list.items.length === 0 && <div className="empty" style={{ margin: 16 }}>No published projects match. An empty area means no published record, not that no work is happening there.</div>}
      </div>
      <div style={{ padding: '10px 18px 16px', borderTop: '1px solid var(--line)' }}>
        <p className="tiny muted">{list ? `${list.notOnMap.toLocaleString('en-US')} matching records are not on the map` : ''}</p>
        <div className="row" style={{ margin: '6px 0' }}>
          <span className="tiny muted">{list ? `${from.toLocaleString('en-US')}–${to.toLocaleString('en-US')} of ${list.total.toLocaleString('en-US')}` : ''}</span>
          <button type="button" className="btn sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button>
          <button type="button" className="btn sm" disabled={!list || offset + pageSize >= list.total} onClick={() => setOffset(offset + pageSize)}>Next</button>
        </div>
        <p className="tiny muted">Only published projects appear. An empty area means no published record, not that no work is happening there.</p>
      </div>
    </div>
  );
}
