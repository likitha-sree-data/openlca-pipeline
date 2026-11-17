import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { all } from '@/lib/db';

const KINDS: Record<string, { table: string; label: string; sub: string }> = {
  organizations: { table: 'organizations', label: 'name', sub: "COALESCE(county, '')" },
  contacts: { table: 'contacts', label: 'name', sub: "COALESCE(title, '')" },
  projects: { table: 'projects', label: 'name', sub: "COALESCE(county, '')" },
  programs: { table: 'programs', label: 'name', sub: "COALESCE(run_by, '')" },
};

export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const kind = req.nextUrl.searchParams.get('kind') ?? '';
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
  const cfg = KINDS[kind];
  if (!cfg) return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = await all<{ id: number; label: string; sub: string }>(
    `SELECT id, ${cfg.label} AS label, ${cfg.sub} AS sub FROM ${cfg.table} WHERE archived = 0 AND ${cfg.label} ILIKE ? ORDER BY ${cfg.label} COLLATE NOCASE LIMIT 12`,
    like,
  );
  return NextResponse.json(rows, { headers: { 'Cache-Control': 'private, no-store' } });
}
