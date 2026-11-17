import { get, run, tx } from '../db';
import type { Outcome } from './store';

export type Stats = { new: number; updated: number; unchanged: number; skipped: number };
export type Ctx = {
  sourceId: number;
  limit: number; // 0 = no limit
  stats: Stats;
  log: (m: string) => void;
  count: (o: Outcome) => void;
  skip: (why: string) => void;
  fetchJson: <T>(url: string, init?: RequestInit) => Promise<T>;
};
export type Fetcher = {
  id: string; // CLI name
  slug: string; // sources.slug
  name: string;
  url: string;
  kind: 'public_record' | 'website';
  description: string;
  run: (ctx: Ctx) => Promise<void>;
};

const UA = () => process.env.INGEST_USER_AGENT || 'TruSembleIngest/0.1 (public-records research)';

export async function fetchJson<T>(url: string, init: RequestInit = {}, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { Accept: 'application/json', 'User-Agent': UA(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: true });
      return (await res.json()) as T;
    } catch (e) {
      last = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function ensureSource(f: Fetcher): Promise<number> {
  const row = await get<{ id: number }>('SELECT id FROM sources WHERE slug = ?', f.slug);
  if (row) return row.id;
  return (await run(`INSERT INTO sources (slug, name, url, kind, description, is_private) VALUES (?, ?, ?, ?, ?, 0)`, f.slug, f.name, f.url, f.kind, f.description)).lastId;
}

/** Run one fetcher inside a recorded run. Each fetcher commits its own batches; a failure keeps what was already saved. */
export async function runFetcher(f: Fetcher, opts: { limit?: number; log?: (m: string) => void; fetchImpl?: Ctx['fetchJson'] } = {}): Promise<{ stats: Stats; ok: boolean; error?: string }> {
  const log = opts.log ?? ((m: string) => console.log(`[${f.id}] ${m}`));
  const sourceId = await ensureSource(f);
  const runId = (await run('INSERT INTO source_runs (source_id) VALUES (?)', sourceId)).lastId;
  const stats: Stats = { new: 0, updated: 0, unchanged: 0, skipped: 0 };
  const skipReasons = new Map<string, number>();
  const ctx: Ctx = {
    sourceId, limit: opts.limit ?? 0, stats, log,
    count: (o) => { stats[o]++; },
    skip: (why) => { stats.skipped++; skipReasons.set(why, (skipReasons.get(why) ?? 0) + 1); },
    fetchJson: opts.fetchImpl ?? fetchJson,
  };
  try {
    await f.run(ctx);
    for (const [why, n] of skipReasons) log(`skipped ${n}: ${why}`);
    await tx(async () => {
      await run(`UPDATE source_runs SET status = 'ok', finished_at = now_iso(), rows_new = ?, rows_updated = ? WHERE id = ?`, stats.new, stats.updated, runId);
      await run(`UPDATE sources SET last_fetched_at = now_iso() WHERE id = ?`, sourceId);
    });
    return { stats, ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await run(`UPDATE source_runs SET status = 'error', finished_at = now_iso(), rows_new = ?, rows_updated = ?, error = ? WHERE id = ?`, stats.new, stats.updated, error.slice(0, 500), runId);
    log(`failed: ${error}`);
    return { stats, ok: false, error };
  }
}

/** Pick the first present, non-empty property from a list of candidate field names (case-insensitive). */
export function pickField(props: Record<string, unknown>, candidates: string[]): string | number | null {
  const lower = new Map(Object.keys(props).map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const k = lower.get(c.toLowerCase());
    if (k === undefined) continue;
    const v = props[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') return typeof v === 'number' ? v : String(v).trim();
  }
  return null;
}
