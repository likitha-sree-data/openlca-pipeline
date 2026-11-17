import type { NextRequest } from 'next/server';
import { json, intParam } from '@/lib/http';
import { listProjects } from '@/lib/public-data';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const res = await listProjects(
    {
      q: q.get('q')?.slice(0, 80) || undefined,
      category: q.get('category') || undefined,
      stage: q.get('stage') || undefined,
      state: q.get('state') || undefined,
      county: q.get('county') || undefined,
    },
    intParam(q.get('limit'), 50, 1, 100),
    intParam(q.get('offset'), 0, 0, 1_000_000),
  );
  return json(res);
}
