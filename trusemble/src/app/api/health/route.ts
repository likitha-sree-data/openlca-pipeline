import { NextResponse } from 'next/server';
import { scalar } from '@/lib/db';

export function GET() {
  try {
    scalar('SELECT 1');
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
