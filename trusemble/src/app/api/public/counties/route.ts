import fs from 'node:fs';
import path from 'node:path';
import { json } from '@/lib/http';
import { countyStats } from '@/lib/public-data';

type Geo = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }[] };
let cache: { mtime: number; geo: Geo } | null = null;

function polygons(): Geo | null {
  const file = path.join(process.cwd(), 'data', 'counties.geojson');
  try {
    const st = fs.statSync(file);
    if (!cache || cache.mtime !== st.mtimeMs) cache = { mtime: st.mtimeMs, geo: JSON.parse(fs.readFileSync(file, 'utf8')) as Geo };
    return cache.geo;
  } catch {
    return null;
  }
}

// County risk, awards and the funding gap. Uses real outlines when `npm run ingest -- tiger-counties` has been run, otherwise centroid markers.
export function GET() {
  const { counties, riskCutoff, gapCount } = countyStats();
  const byFips = new Map(counties.map((c) => [c.fips, c]));
  const geo = polygons();
  if (geo) {
    const features = geo.features.map((f) => {
      const fips = String(f.properties.GEOID ?? f.properties.fips ?? '');
      const c = byFips.get(fips);
      return { ...f, id: fips, properties: { fips, name: c?.name ?? f.properties.NAME, state: c?.state, risk: c?.risk ?? null, awards: c?.awards ?? 0, committed: c?.committed ?? 0, requested: c?.requested ?? 0, firewise: c?.firewise ?? 0, fema: c?.fema ?? 0, federal: c?.federal ?? 0, gap: c?.gap ? 1 : 0 } };
    });
    return json({ mode: 'polygons', riskCutoff, gapCount, geojson: { type: 'FeatureCollection', features } });
  }
  return json({
    mode: 'points', riskCutoff, gapCount,
    geojson: {
      type: 'FeatureCollection',
      features: counties.filter((c) => c.lat != null && c.lng != null).map((c) => ({
        type: 'Feature', id: c.fips,
        properties: { fips: c.fips, name: c.name, state: c.state, risk: c.risk, awards: c.awards, committed: c.committed, requested: c.requested, firewise: c.firewise, fema: c.fema, federal: c.federal, gap: c.gap ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      })),
    },
  });
}
