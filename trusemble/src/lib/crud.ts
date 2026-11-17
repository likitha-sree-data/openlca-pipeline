import { all, get, run, scalar, tx, type Param } from './db';
import { clean, nameKey, toNumber } from './text';
import { ENTITIES, type EntityCfg, type Field } from './entities';
import { REQUEST_STATUSES, US_STATES } from './constants';
import { isRealDate } from './format';

export type Values = Record<string, string | number | null>;
export type ParseResult = { ok: true; data: Values } | { ok: false; errors: Record<string, string>; values: Record<string, string> };

const URL_RE = /^https?:\/\/[^\s]+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate form input against field specs. Empty optional values become null. */
export function parseFields(fields: Field[], input: { get(name: string): unknown }): ParseResult {
  const data: Values = {};
  const errors: Record<string, string> = {};
  const raw: Record<string, string> = {};
  for (const f of fields) {
    const v = input.get(f.name);
    const s = typeof v === 'string' ? v.trim() : '';
    raw[f.name] = s;
    if (f.type === 'checkbox') { data[f.name] = v === 'on' || v === '1' || v === 'true' ? 1 : 0; continue; }
    if (s === '') {
      if (f.required) errors[f.name] = `${f.label} is required`;
      data[f.name] = null;
      continue;
    }
    switch (f.type) {
      case 'number': {
        const n = toNumber(s);
        if (n === null) errors[f.name] = `${f.label} must be a number`;
        else data[f.name] = n;
        break;
      }
      case 'ref': {
        if (!/^\d+$/.test(s)) errors[f.name] = `Pick a ${f.label.toLowerCase()} from the list`;
        else data[f.name] = Number(s);
        break;
      }
      case 'url': if (!URL_RE.test(s)) errors[f.name] = `${f.label} must start with http:// or https://`; else data[f.name] = s; break;
      case 'email': if (!EMAIL_RE.test(s)) errors[f.name] = `${f.label} is not a valid email`; else data[f.name] = s.toLowerCase(); break;
      case 'date': if (!isRealDate(s)) errors[f.name] = `${f.label} must be a date`; else data[f.name] = s; break;
      case 'select':
        if (f.options && !f.options.some((o) => o[0] === s)) errors[f.name] = `Choose a valid ${f.label.toLowerCase()}`;
        else data[f.name] = s;
        break;
      case 'tags': data[f.name] = s.split(',').map((t) => t.trim()).filter(Boolean).join(', '); break;
      default: data[f.name] = clean(s);
    }
    if (f.name === 'lat' && typeof data.lat === 'number' && (data.lat < -90 || data.lat > 90)) errors.lat = 'Latitude must be between -90 and 90';
    if (f.name === 'lng' && typeof data.lng === 'number' && (data.lng < -180 || data.lng > 180)) errors.lng = 'Longitude must be between -180 and 180';
  }
  return Object.keys(errors).length ? { ok: false, errors, values: raw } : { ok: true, data };
}

function derived(cfg: EntityCfg, d: Values): Values {
  const out: Values = {};
  if (cfg.key === 'organizations' || cfg.key === 'projects' || cfg.key === 'contacts' || cfg.key === 'programs') {
    out.name_key = nameKey(String(d.name ?? ''));
  }
  if (cfg.key === 'requests') out.from_key = nameKey(String(d.from_name ?? ''));
  if (cfg.key === 'programs') {
    out.rolling = !d.window_start && !d.window_end ? 1 : 0;
    out.where_label = whereLabel(String(d.scope ?? 'national'), (d.state as string) ?? null, (d.counties as string) ?? null);
  }
  if (d.lat != null && d.lng != null && !d.location_precision && 'location_precision' in d) out.location_precision = 'area_centre';
  return out;
}

export function whereLabel(scope: string, state: string | null, counties: string | null): string {
  if (scope === 'national') return 'United States (federal program)';
  const name = state ? US_STATES[state] ?? state : '';
  if (scope === 'state') return `${name} (statewide)`;
  const list = (counties ?? '').split(',').map((c) => c.trim()).filter(Boolean);
  return list.length === 1 ? `${list[0]}${/county$/i.test(list[0]) ? '' : ' County'}` : `${name} (${list.length} counties)`;
}

export async function nextRef(year = new Date().getUTCFullYear()): Promise<string> {
  const prefix = `TS-${year}-`;
  const last = (await get<{ ref: string }>(`SELECT ref FROM requests WHERE ref ILIKE ? ORDER BY ref DESC LIMIT 1`, prefix + '%'))?.ref;
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

export async function logActivity(entity: string, id: number, userId: number | null, kind: string, body: string) {
  await run('INSERT INTO activities (entity, entity_id, user_id, kind, body) VALUES (?, ?, ?, ?, ?)', entity, id, userId, kind, body);
}

export async function insertRow(cfg: EntityCfg, data: Values, userId: number | null, extra: Values = {}): Promise<number> {
  return await tx(async () => {
    const row: Values = { ...data, ...derived(cfg, data), ...extra };
    if (cfg.key === 'requests') {
      row.ref = row.ref ?? await nextRef();
      row.priority = row.priority ?? null;
    }
    const cols = Object.keys(row);
    const { lastId } = await run(
      `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      ...(cols.map((c) => row[c]) as Param[]),
    );
    await logActivity(cfg.key, lastId, userId, 'created', `Created ${cfg.singular}`);
    return lastId;
  });
}

export async function updateRow(cfg: EntityCfg, id: number, data: Values, userId: number | null): Promise<string[]> {
  return await tx(async () => {
    const before = await get<Record<string, unknown>>(`SELECT * FROM ${cfg.table} WHERE id = ?`, id);
    if (!before) throw new Error(`${cfg.singular} ${id} not found`);
    const row: Values = { ...data, ...derived(cfg, data) };
    const changed = Object.keys(row).filter((k) => (before[k] ?? null) !== (row[k] ?? null));
    if (changed.length === 0) return [];
    const sets = changed.map((c) => `${c} = ?`);
    sets.push(`updated_at = now_iso()`);
    if (cfg.key === 'requests' && changed.includes('status')) {
      sets.push(`status_changed_at = now_iso()`);
      sets.push(row.status === 'closed' ? `closed_at = now_iso()` : 'closed_at = NULL');
      await logActivity('requests', id, userId, 'status', `Status changed from ${statusLabel(String(before.status))} to ${statusLabel(String(row.status))}`);
    }
    await run(`UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = ?`, ...(changed.map((c) => row[c]) as Param[]), id);
    const visible = changed.filter((c) => !['name_key', 'from_key', 'where_label', 'rolling'].includes(c));
    if (visible.length) await logActivity(cfg.key, id, userId, 'edit', `Edited ${visible.join(', ')}`);
    return changed;
  });
}

const statusLabel = (s: string) => REQUEST_STATUSES.find((o) => o[0] === s)?.[1] ?? s;

export async function setArchived(cfg: EntityCfg, id: number, archived: boolean, userId: number) {
  await run(`UPDATE ${cfg.table} SET archived = ?, updated_at = now_iso() WHERE id = ?`, archived ? 1 : 0, id);
  await logActivity(cfg.key, id, userId, 'edit', archived ? 'Archived' : 'Restored from archive');
}

/** A person checked this row against its source. Feeds the pilot scorecard. */
export async function markVerified(cfg: EntityCfg, id: number, userId: number, outcome: 'confirmed' | 'corrected', note?: string | null) {
  await tx(async () => {
    await run(
      `UPDATE ${cfg.table} SET verification = 'verified', verified_by = ?, verified_at = now_iso() WHERE id = ?`,
      userId, id,
    );
    await run('INSERT INTO record_reviews (user_id, entity, entity_id, outcome, note) VALUES (?, ?, ?, ?, ?)', userId, cfg.key, id, outcome, note ?? null);
    await logActivity(cfg.key, id, userId, 'verified', `Checked against its source (${outcome})${note ? `: ${note}` : ''}`);
  });
}

export async function markUnverified(cfg: EntityCfg, id: number, userId: number) {
  await run(`UPDATE ${cfg.table} SET verification = 'unverified', verified_by = NULL, verified_at = NULL WHERE id = ?`, id);
  await logActivity(cfg.key, id, userId, 'verified', 'Verification removed');
}

// ---------- listing ----------
export type ListParams = {
  q?: string;
  verification?: string; // verified | unverified | demo
  filters?: Record<string, string | undefined>;
  tab?: string; // requests status tab
  extra?: { sql: string; params: Param[] }; // an additional ready-made condition, e.g. the requests assigned to me
  limit?: number;
  offset?: number;
};

function listWhere(cfg: EntityCfg, p: ListParams, withVerification: boolean) {
  const parts: string[] = [];
  const params: Param[] = [];
  const a = cfg.alias;
  if (p.q) {
    const like = `%${p.q.replace(/[%_]/g, '')}%`;
    parts.push(`(${cfg.search.map((c) => `${c} ILIKE ?`).join(' OR ')})`);
    params.push(...cfg.search.map(() => like));
  }
  for (const f of cfg.filters) {
    const v = p.filters?.[f.name];
    if (!v) continue;
    const c = f.clause(v);
    if (c) { parts.push(c.sql); params.push(...c.params); }
  }
  if (withVerification && p.verification && ['verified', 'unverified', 'demo'].includes(p.verification)) {
    parts.push(`${a}.verification = ?`);
    params.push(p.verification);
  }
  if (p.extra) { parts.push(p.extra.sql); params.push(...p.extra.params); }
  if (cfg.key === 'requests' && p.tab && p.tab !== 'all') {
    const map: Record<string, string> = { new: "r.status IN ('new','needs_info')", conversation: "r.status = 'qualified'", progress: "r.status = 'matching'", intro: "r.status = 'intro_made'", closed: "r.status = 'closed'" };
    if (map[p.tab]) parts.push(map[p.tab]);
  }
  return { where: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

export async function listRows<T = Record<string, unknown>>(cfg: EntityCfg, p: ListParams) {
  const main = listWhere(cfg, p, true);
  const noVer = listWhere(cfg, p, false);
  const total = await scalar<number>(`SELECT COUNT(*) FROM ${cfg.from} ${main.where}`, ...main.params);
  const split = await all<{ v: string; n: number }>(`SELECT ${cfg.alias}.verification v, COUNT(*) n FROM ${cfg.from} ${noVer.where} GROUP BY ${cfg.alias}.verification`, ...noVer.params);
  const counts = { verified: 0, unverified: 0, demo: 0 };
  for (const s of split) if (s.v in counts) counts[s.v as keyof typeof counts] = s.n;
  const rows = await all<T>(
    `SELECT ${cfg.select} FROM ${cfg.from} ${main.where} ORDER BY ${cfg.orderBy} LIMIT ? OFFSET ?`,
    ...main.params, p.limit ?? 50, p.offset ?? 0,
  );
  return { rows, total, counts };
}

/** Distinct values for dropdown filters that depend on the data. */
export async function distinctOptions(cfg: EntityCfg, filter: string): Promise<[string, string][]> {
  const col = { county: `${cfg.alias}.county`, available_in: `${cfg.alias}.state` }[filter];
  if (col) {
    return (await all<{ v: string }>(`SELECT DISTINCT ${col} v FROM ${cfg.from} WHERE ${col} IS NOT NULL AND ${col} != '' ORDER BY v LIMIT 500`)).map((r) => [r.v, r.v]);
  }
  if (filter === 'pays_for') {
    const set = new Set<string>();
    for (const r of await all<{ focus: string | null }>(`SELECT focus FROM programs WHERE focus IS NOT NULL`)) {
      for (const t of (r.focus ?? '').split(',')) if (t.trim()) set.add(t.trim());
    }
    return [...set].sort().map((t) => [t, t]);
  }
  return [];
}

export async function getRow<T = Record<string, unknown>>(cfg: EntityCfg, id: number): Promise<T | undefined> {
  return await get<T>(`SELECT * FROM ${cfg.table} WHERE id = ?`, id);
}

export async function userOptions(): Promise<[string, string][]> {
  return (await all<{ id: number; name: string }>('SELECT id, name FROM users ORDER BY name')).map((u) => [String(u.id), u.name]);
}

export async function verificationSplit(table: string, where = '1=1', ...params: Param[]) {
  const rows = await all<{ v: string; n: number }>(`SELECT verification v, COUNT(*) n FROM ${table} WHERE ${where} GROUP BY verification`, ...params);
  const out = { verified: 0, unverified: 0, demo: 0, total: 0 };
  for (const r of rows) { if (r.v in out) out[r.v as 'verified' | 'unverified' | 'demo'] = r.n; out.total += r.n; }
  return out;
}

export { ENTITIES };
