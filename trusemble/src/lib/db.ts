import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './schema';

type G = typeof globalThis & { __trusembleDb?: DatabaseSync };

export function dbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'trusemble.db');
}

export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  d.exec(SCHEMA);
  return d;
}

/** One connection per process, kept across hot reloads. */
export function db(): DatabaseSync {
  const g = globalThis as G;
  if (!g.__trusembleDb) g.__trusembleDb = openDatabase(dbPath());
  return g.__trusembleDb;
}

export function setDb(d: DatabaseSync | undefined) {
  (globalThis as G).__trusembleDb = d;
}

export type Param = SQLInputValue;

// node:sqlite returns null-prototype objects, which React cannot pass to client components. Copy into plain objects.
export function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[] {
  return db().prepare(sql).all(...params).map((r) => ({ ...r })) as T[];
}
export function get<T = Record<string, unknown>>(sql: string, ...params: Param[]): T | undefined {
  const r = db().prepare(sql).get(...params);
  return r ? ({ ...r } as T) : undefined;
}
export function run(sql: string, ...params: Param[]): { changes: number; lastId: number } {
  const r = db().prepare(sql).run(...params);
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}
export function scalar<T = number>(sql: string, ...params: Param[]): T {
  const row = db().prepare(sql).get(...params) as Record<string, T> | undefined;
  return row ? (Object.values(row)[0] as T) : (0 as T);
}

/** Run fn inside a transaction; rolls back on throw. Safe to nest. */
let depth = 0;
export function tx<T>(fn: () => T): T {
  const d = db();
  if (depth > 0) return fn();
  d.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export const nowIso = () => new Date().toISOString();
