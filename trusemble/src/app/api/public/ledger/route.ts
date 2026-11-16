import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sourcesLedger } from '@/lib/public-data';
import { feedTotal } from '@/lib/format-feeds';
import { toCsv } from '@/lib/text';

// Public ledger of every non-private source: what it feeds and when it was last retrieved. /api/public/ledger?format=csv for a spreadsheet.
export function GET(req: NextRequest) {
  const rows = sourcesLedger().map((s) => ({
    name: s.name, url: s.url ?? '', kind: s.kind, organizations: s.feeds.organizations, projects: s.feeds.projects, funding_programs: s.feeds.programs,
    funding_awards: s.feeds.awards, rows_fed: feedTotal(s.feeds), last_fetched: s.last_fetched_at ?? '', verification: s.verification, description: s.description ?? '',
  }));
  const headers = { 'Cache-Control': 'public, max-age=300' };
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    return new NextResponse(toCsv(rows), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="trusemble-source-ledger.csv"' } });
  }
  return NextResponse.json({ generated_at: new Date().toISOString(), sources: rows }, { headers });
}
