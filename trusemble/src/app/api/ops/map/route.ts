import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { all } from '@/lib/db';
import { bboxParam } from '@/lib/http';

// Every project and organization with a location, published or not. Operators only.
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const bbox = bboxParam(req.nextUrl.searchParams.get('bbox')) ?? [-180, -90, 180, 90];
  const layers = (req.nextUrl.searchParams.get('layers') ?? 'projects').split(',');
  const features: unknown[] = [];
  const geo = 'lng BETWEEN ? AND ? AND lat BETWEEN ? AND ?';
  const b = [bbox[0], bbox[2], bbox[1], bbox[3]];
  if (layers.includes('projects')) {
    for (const r of await all<{ id: number; name: string; published: number; verification: string; county: string | null; lat: number; lng: number }>(`SELECT id, name, published, verification, county, lat, lng FROM projects WHERE archived = 0 AND lat IS NOT NULL AND ${geo} LIMIT 6000`, ...b))
      features.push({ type: 'Feature', properties: { kind: 'Project', ...r }, geometry: { type: 'Point', coordinates: [r.lng, r.lat] } });
  }
  if (layers.includes('organizations')) {
    for (const r of await all<{ id: number; name: string; published: number; verification: string; county: string | null; lat: number; lng: number }>(`SELECT id, name, published, verification, county, lat, lng FROM organizations WHERE archived = 0 AND lat IS NOT NULL AND ${geo} LIMIT 6000`, ...b))
      features.push({ type: 'Feature', properties: { kind: 'Organization', ...r }, geometry: { type: 'Point', coordinates: [r.lng, r.lat] } });
  }
  return NextResponse.json({ type: 'FeatureCollection', features }, { headers: { 'Cache-Control': 'private, no-store' } });
}
