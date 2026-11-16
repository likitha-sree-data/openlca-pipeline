import type { NextRequest } from 'next/server';
import { bboxParam, intParam, json } from '@/lib/http';
import { mapGrid, mapOrgs, mapPoints, ORG_LAYERS } from '@/lib/public-data';

// Returns GeoJSON for the visible map window. Projects switch from grid squares to points when zoomed in.
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const layer = q.get('layer') ?? 'projects';
  const bbox = bboxParam(q.get('bbox'));
  const zoom = intParam(q.get('zoom'), 4, 0, 22);
  const filters = {
    q: q.get('q')?.slice(0, 80) || undefined,
    category: q.get('category') || undefined,
    stage: q.get('stage') || undefined,
    state: q.get('state') || undefined,
    county: q.get('county') || undefined,
  };
  if (layer === 'projects') {
    if (zoom >= 9 && bbox) {
      const pts = mapPoints(filters, bbox);
      return json({
        kind: 'points',
        geojson: { type: 'FeatureCollection', features: pts.map((p) => ({ type: 'Feature', id: p.id, properties: { id: p.id, name: p.name, stage: p.stage, precision: p.location_precision, county: p.county }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) },
      });
    }
    const { features } = mapGrid(filters, bbox, zoom);
    return json({ kind: 'grid', geojson: { type: 'FeatureCollection', features } });
  }
  if (layer in ORG_LAYERS && bbox) {
    const orgs = mapOrgs(layer, bbox);
    return json({
      kind: 'orgs',
      geojson: { type: 'FeatureCollection', features: orgs.map((o) => ({ type: 'Feature', id: o.id, properties: { id: o.id, name: o.name, type: o.type, county: o.county }, geometry: { type: 'Point', coordinates: [o.lng, o.lat] } })) },
    });
  }
  return json({ error: 'Unknown layer' }, { status: 400 });
}
