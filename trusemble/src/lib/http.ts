import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';

export const json = (data: unknown, init?: { status?: number; cache?: string }) =>
  NextResponse.json(data, { status: init?.status ?? 200, headers: { 'Cache-Control': init?.cache ?? 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } });

export function intParam(v: string | null, def: number, min: number, max: number): number {
  const n = v === null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : def;
}

export function bboxParam(v: string | null): [number, number, number, number] | null {
  if (!v) return null;
  const p = v.split(',').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = p;
  if (w < -180 || e > 180 || s < -90 || n > 90 || w > e || s > n) return null;
  return [w, s, e, n];
}

/** A salted hash of the caller's address, used only to key rate limits. The address itself is never stored. */
export async function callerKey(): Promise<string> {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`${process.env.SESSION_SECRET ?? 'dev'}:${ip}`).digest('hex').slice(0, 24);
}
