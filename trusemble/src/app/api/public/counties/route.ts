import { json } from '@/lib/http';
import { countyStats } from '@/lib/public-data';
import { blobVersion, getBlob } from '@/lib/blobs';

type Geo = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }[] };
let cache: { version: string; geo: Geo } | null = null;

/** County outlines live in the database. Parse them once per change, not once per request. */
async function polygons(): Promise<Geo | null> {
  const version = await blobVersion('counties.geojson');
  if (!version) return null;
  if (cache?.version === version) return cache.geo;
  const bytes = await getBlob('counties.geojson');
  if (!bytes) return null;
  try {
    cache = { version, geo: JSON.parse(bytes.toString('utf8')) as Geo };
    return cache.geo;
  } catch {
    return null;
  }
}

// County risk, awards and the funding gap. Uses real outlines when `npm run ingest -- tiger-counties` has been run, otherwise centroid markers.
export async function GET() {
  const { counties, riskCutoff, gapCount } = await countyStats();
  const byFips = new Map(counties.map((c) => [c.fips, c]));
  const geo = await polygons();
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
