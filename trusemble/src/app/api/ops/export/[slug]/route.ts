import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { entityBySlug } from '@/lib/entities';
import { all } from '@/lib/db';
import { toCsv } from '@/lib/text';

// Operator-only CSV export of one record type. Contact details are included because this route requires a signed-in operator.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { slug } = await params;
  const cfg = entityBySlug(slug);
  if (!cfg) return NextResponse.json({ error: 'Unknown record type' }, { status: 404 });
  const rows = all<Record<string, unknown>>(`SELECT * FROM ${cfg.table} ORDER BY id`);
  return new NextResponse(toCsv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="trusemble-${cfg.slug}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'private, no-store' },
  });
}
