import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { FUNCTIONS, SCHEMA } from './schema';

/**
 * One data layer, two engines, one SQL dialect (Postgres):
 *  - DATABASE_URL set: a hosted Postgres (Neon, Supabase, Render, RDS, anything that speaks Postgres), used for deployment.
 *  - otherwise an embedded Postgres (PGlite) kept in ./data/pglite, so local work and tests need no server.
 * Queries use `?` placeholders; they are converted to $1, $2 here.
 */

export type Param = string | number | boolean | Uint8Array | null | undefined;
type Result = { rows: Record<string, unknown>[]; count: number };
interface Conn { query(sql: string, params: unknown[]): Promise<Result> }
interface Driver extends Conn {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (c: Conn) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: 'pg' | 'pglite';
}

const als = new AsyncLocalStorage<Conn>();

/** Tables whose primary key is not an `id` column, so INSERT must not ask for RETURNING id. */
const NO_ID = new Set(['settings', 'rate_limits', 'pilot_members', 'counties', 'blobs']);

/** `?` and `?1` placeholders to Postgres `$n`, leaving quoted text alone. */
export function toPostgres(sql: string): string {
  let out = '';
  let n = 0;
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) { out += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    if (ch === '?') {
      const m = /^\d+/.exec(sql.slice(i + 1));
      if (m) { out += `$${m[0]}`; i += m[0].length; } else out += `$${++n}`;
      continue;
    }
    out += ch;
  }
  return out;
}

const clean = (params: Param[]) => params.map((p) => (p === undefined ? null : p));

async function makePg(url: string): Promise<Driver> {
  const pg = await import('pg');
  pg.types.setTypeParser(20, (v: string) => Number(v)); // bigint (COUNT)
  pg.types.setTypeParser(1700, (v: string) => Number(v)); // numeric (SUM)
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX || 5), idleTimeoutMillis: 20_000 });
  const wrap = (c: { query: (s: string, p: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> }): Conn => ({
    async query(sql, params) { const r = await c.query(sql, params); return { rows: r.rows, count: r.rowCount ?? 0 }; },
  });
  return {
    kind: 'pg',
    ...wrap(pool),
    async exec(sql) { await pool.query(sql); },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
}

async function makeLite(dir: string | undefined): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lite = new PGlite(dir, { parsers: { 1700: (v: string) => Number(v), 20: (v: string) => Number(v) } });
  await lite.waitReady;
  const wrap = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> }): Conn => ({
    async query(sql, params) { const r = await c.query(sql, params); return { rows: r.rows as Record<string, unknown>[], count: r.affectedRows ?? r.rows.length }; },
  });
  return {
    kind: 'pglite',
    ...wrap(lite),
    async exec(sql) { await lite.exec(sql); },
    async transaction(fn) { return lite.transaction(async (t) => fn(wrap(t as never))); },
    async close() { await lite.close(); },
  };
}

type G = typeof globalThis & { __trusembleDriver?: Promise<Driver> };

export function liteDir(): string {
  return process.env.PGLITE_DIR || path.join(process.cwd(), 'data', 'pglite');
}

/** A short, safe description of where data lives, for the settings page and logs. */
export function databaseLabel(): string {
  const url = process.env.DATABASE_URL;
  if (url) { try { return `Postgres at ${new URL(url).hostname}`; } catch { return 'Postgres'; } }
  return 'Embedded Postgres on this machine';
}

async function open(memory = false): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (!memory && !url && process.env.NODE_ENV === 'production' && process.env.ALLOW_EMBEDDED_DB !== '1') {
    // The embedded engine keeps data on this machine's disk, which most hosts wipe on every deploy or restart.
    throw new Error('DATABASE_URL is not set. Point it at a hosted Postgres (see the README), or set ALLOW_EMBEDDED_DB=1 to use the embedded database on a disk that persists.');
  }
  const d = !memory && url ? await makePg(url) : await makeLite(memory ? undefined : liteDir());
  // Create tables if they are missing. The lock stops two servers starting at once from racing.
  if (d.kind === 'pg') {
    await d.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(735100)', []);
      await c.query(FUNCTIONS, []);
      await c.query(SCHEMA, []);
    });
  } else {
    await d.exec(FUNCTIONS);
    await d.exec(SCHEMA);
  }
  return d;
}

function driver(): Promise<Driver> {
  const g = globalThis as G;
  if (!g.__trusembleDriver) g.__trusembleDriver = open();
  return g.__trusembleDriver;
}

/** For tests: an empty in-memory database, replacing whatever was open. */
export async function useMemoryDatabase(): Promise<void> {
  const g = globalThis as G;
  if (g.__trusembleDriver) await (await g.__trusembleDriver).close().catch(() => {});
  g.__trusembleDriver = open(true);
  await g.__trusembleDriver;
}

/** Empty every table and restart numbering, keeping the tables. For tests and `db:reset`. */
export async function emptyAllTables(): Promise<void> {
  const d = await driver();
  const t = await d.query(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`, []);
  const names = t.rows.map((r) => `"${String(r.tablename)}"`);
  if (names.length) await d.exec(`TRUNCATE ${names.join(', ')} RESTART IDENTITY CASCADE`);
}

export async function closeDatabase(): Promise<void> {
  const g = globalThis as G;
  if (g.__trusembleDriver) { await (await g.__trusembleDriver).close().catch(() => {}); g.__trusembleDriver = undefined; }
}

async function conn(): Promise<Conn> {
  return als.getStore() ?? (await driver());
}

export async function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T[]> {
  const r = await (await conn()).query(toPostgres(sql), clean(params));
  return r.rows as T[];
}
export async function get<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T | undefined> {
  const r = await (await conn()).query(toPostgres(sql), clean(params));
  return r.rows[0] as T | undefined;
}
export async function scalar<T = number>(sql: string, ...params: Param[]): Promise<T> {
  const r = await (await conn()).query(toPostgres(sql), clean(params));
  const row = r.rows[0];
  return (row ? Object.values(row)[0] : 0) as T;
}

/** Run a statement. For INSERTs into tables with an `id`, `lastId` is the new row's id (0 if nothing was inserted). */
export async function run(sql: string, ...params: Param[]): Promise<{ changes: number; lastId: number }> {
  let text = toPostgres(sql);
  const m = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(text);
  const wantsId = !!m && !NO_ID.has(m[1].toLowerCase()) && !/\bRETURNING\b/i.test(text);
  if (wantsId) text = text.replace(/;?\s*$/, '') + ' RETURNING id';
  const r = await (await conn()).query(text, clean(params));
  return { changes: r.count, lastId: wantsId && r.rows[0] ? Number(r.rows[0].id) : 0 };
}

/** Run a set of statements as one unit: all happen or none do. Calls inside it share the same transaction. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) return fn();
  const d = await driver();
  return d.transaction((c) => als.run(c, fn));
}

export async function exec(sql: string): Promise<void> {
  await (await driver()).exec(sql);
}

export const nowIso = () => new Date().toISOString();
