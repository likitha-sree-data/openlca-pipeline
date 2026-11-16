export type Pt = { lat: number; lng: number };
export type GridFeature = {
  type: 'Feature';
  properties: { count: number; bucket: 1 | 3 | 10 | 30 | 100 };
  geometry: { type: 'Polygon'; coordinates: number[][][] };
};

/** Cell size in degrees for a map zoom level: about 1 degree at zoom 4, halving per zoom. */
export function cellForZoom(zoom: number): number {
  return Math.max(0.005, 16 / 2 ** Math.round(zoom));
}

export function bucketFor(count: number): 1 | 3 | 10 | 30 | 100 {
  return count >= 100 ? 100 : count >= 30 ? 30 : count >= 10 ? 10 : count >= 3 ? 3 : 1;
}

export function aggregateGrid(points: Pt[], cell: number): GridFeature[] {
  const counts = new Map<string, { x: number; y: number; n: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const x = Math.floor(p.lng / cell);
    const y = Math.floor(p.lat / cell);
    const k = `${x}:${y}`;
    const c = counts.get(k);
    if (c) c.n++;
    else counts.set(k, { x, y, n: 1 });
  }
  const pad = cell * 0.06; // gap between squares so they read as a grid
  return [...counts.values()].map(({ x, y, n }) => {
    const w = x * cell + pad, e = (x + 1) * cell - pad, s = y * cell + pad, nn = (y + 1) * cell - pad;
    return {
      type: 'Feature',
      properties: { count: n, bucket: bucketFor(n) },
      geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, nn], [w, nn], [w, s]]] },
    };
  });
}
