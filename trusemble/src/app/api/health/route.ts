import { NextResponse } from 'next/server';
import { scalar } from '@/lib/db';

export async function GET() {
  try {
    await scalar('SELECT 1');
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
