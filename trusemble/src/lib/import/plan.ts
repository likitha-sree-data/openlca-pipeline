import { all, get } from '../db';
import { clean, nameKey, toNumber } from '../text';
import { enumValue, IMPORT_FIELDS, type ImportEntity } from './fields';
import type { ParsedSheet } from './parse';

export type SheetMapping = { include: boolean; columns: Record<string, string> };
export type Mapping = { entity: ImportEntity; sheets: Record<string, SheetMapping> };

export type Change = { field: string; from: string | number | null; to: string | number | null };
export type PlanItem = {
  sheet: string;
  row: number;
  action: 'new' | 'updated' | 'unchanged' | 'conflict' | 'invalid';
  label: string;
  matchId: number | null;
  values: Record<string, string | number | null>;
  changes: Change[];
  conflicts: Change[];
  problem?: string;
  flags: { doNotContact?: boolean };
};
export type Plan = {
  entity: ImportEntity;
  items: PlanItem[];
  summary: { new: number; updated: number; unchanged: number; conflict: number; invalid: number; total: number };
};

type Rec = Record<string, string | number | null>;

/** Turn one mapped sheet row into typed values for the target table. */
export function typedValues(entity: ImportEntity, mapped: Record<string, string>): { values: Rec; problem?: string } {
  const v: Rec = {};
  const problems: string[] = [];
  const s = (k: string) => clean(mapped[k]);
  switch (entity) {
    case 'organizations': {
      v.name = s('name'); v.website = normUrl(s('website')); v.city = s('city'); v.county = s('county');
      const st = s('state'); v.state = st ? enumValue('state', st) ?? (st.length === 2 ? st.toUpperCase() : null) : null;
      const t = s('type'); v.type = t ? enumValue('type', t) : null;
      if (t && !v.type) problems.push(`Unknown type "${t}" (left as Other)`);
      break;
    }
    case 'contacts': {
      v.name = s('name'); v.title = s('title'); v.organization = s('organization'); v.email = s('email')?.toLowerCase() ?? null; v.phone = s('phone');
      const r = s('decision_role'); v.decision_role = r ? enumValue('decision_role', r) : null;
      if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v.email))) { problems.push(`Invalid email "${v.email}"`); v.email = null; }
      break;
    }
    case 'requests': {
      v.from_name = s('from_name'); v.ref = s('ref'); v.substatus = s('substatus'); v.amount_text = s('amount_text'); v.next_action = s('next_action');
      v.message = s('message'); v.organization = s('organization'); v.contact = s('contact'); v.email = s('email')?.toLowerCase() ?? null; v.phone = s('phone');
      const k = s('kind'); v.kind = k ? enumValue('kind', k) : null;
      const st = s('status'); v.status = st ? enumValue('status', st) : null;
      if (st && !v.status) { v.substatus = v.substatus ?? st; }
      const p = s('priority'); v.priority = p ? enumValue('priority', p) : null;
      const d = s('next_action_date'); v.next_action_date = d ? toIsoDate(d) : null;
      if (d && !v.next_action_date) problems.push(`Could not read date "${d}"`);
      v.owner = s('owner');
      break;
    }
    case 'projects': {
      v.name = s('name'); v.organization = s('organization'); v.county = s('county'); v.needs = s('needs'); v.description = s('description');
      const st = s('state'); v.state = st ? enumValue('state', st) ?? (st.length === 2 ? st.toUpperCase() : null) : null;
      const sg = s('stage'); v.stage = sg ? enumValue('stage', sg) : null;
      v.requested_amount = toNumber(s('requested_amount'));
      v.lat = toNumber(s('lat')); v.lng = toNumber(s('lng'));
      if ((v.lat != null) !== (v.lng != null)) { problems.push('Latitude and longitude must come together'); v.lat = null; v.lng = null; }
      break;
    }
  }
  return { values: v, problem: problems.length ? problems.join('; ') : undefined };
}

export function normUrl(u: string | null): string | null {
  if (!u) return null;
  const t = u.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return /^[\w-]+(\.[\w-]+)+/.test(t) ? `https://${t}` : null;
}

export function toIsoDate(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

type Existing = { id: number; verification: string; [k: string]: unknown };

function findExisting(entity: ImportEntity, v: Rec): Existing | undefined {
  switch (entity) {
    case 'organizations': {
      const key = nameKey(String(v.name ?? ''));
      if (v.state) return get<Existing>('SELECT * FROM organizations WHERE name_key = ? AND (state = ? OR state IS NULL) ORDER BY (state = ?) DESC LIMIT 1', key, v.state, v.state);
      return get<Existing>('SELECT * FROM organizations WHERE name_key = ? LIMIT 1', key);
    }
    case 'contacts': {
      if (v.email) { const r = get<Existing>('SELECT * FROM contacts WHERE email = ? LIMIT 1', v.email); if (r) return r; }
      const key = nameKey(String(v.name ?? ''));
      const orgKey = v.organization ? nameKey(String(v.organization)) : null;
      return orgKey
        ? get<Existing>('SELECT c.* FROM contacts c JOIN organizations o ON o.id = c.org_id WHERE c.name_key = ? AND o.name_key = ? LIMIT 1', key, orgKey)
        : get<Existing>('SELECT * FROM contacts WHERE name_key = ? LIMIT 1', key);
    }
    case 'requests': {
      if (v.ref) { const r = get<Existing>('SELECT * FROM requests WHERE ref = ?', v.ref); if (r) return r; }
      return get<Existing>('SELECT * FROM requests WHERE from_key = ? AND origin = ? LIMIT 1', nameKey(String(v.from_name ?? '')), 'import')
        ?? get<Existing>('SELECT * FROM requests WHERE from_key = ? ORDER BY id LIMIT 1', nameKey(String(v.from_name ?? '')));
    }
    case 'projects':
      return get<Existing>('SELECT * FROM projects WHERE name_key = ? AND (county = ? OR county IS NULL OR ? IS NULL) LIMIT 1', nameKey(String(v.name ?? '')), v.county ?? null, v.county ?? null);
  }
}

/** Columns of the target table that an import may write directly. */
export const WRITABLE: Record<ImportEntity, string[]> = {
  organizations: ['type', 'website', 'city', 'county', 'state'],
  contacts: ['title', 'email', 'phone', 'decision_role'],
  requests: ['kind', 'status', 'substatus', 'priority', 'amount_text', 'next_action', 'next_action_date', 'message'],
  projects: ['stage', 'county', 'state', 'needs', 'requested_amount', 'description', 'lat', 'lng'],
};

const REQUIRED: Record<ImportEntity, string> = { organizations: 'name', contacts: 'name', requests: 'from_name', projects: 'name' };

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a ?? '') === String(b ?? '');

export function buildPlan(entity: ImportEntity, sheets: ParsedSheet[], mapping: Mapping): Plan {
  const items: PlanItem[] = [];
  const seen = new Set<string>(); // duplicate rows inside the file
  for (const sheet of sheets) {
    const sm = mapping.sheets[sheet.name];
    if (!sm?.include) continue;
    const dnc = /dnc|do not contact/i.test(sheet.name);
    sheet.rows.forEach((row, i) => {
      const mapped: Record<string, string> = {};
      for (const [header, field] of Object.entries(sm.columns)) if (field) mapped[field] = row[header] ?? '';
      const { values, problem } = typedValues(entity, mapped);
      const reqField = REQUIRED[entity];
      const label = String(values[reqField] ?? '(blank)');
      const base = { sheet: sheet.name, row: i + 2, label, values, matchId: null as number | null, changes: [] as Change[], conflicts: [] as Change[], flags: { doNotContact: dnc } };
      if (!values[reqField]) { items.push({ ...base, action: 'invalid', problem: `${IMPORT_FIELDS[entity].find((f) => f.name === reqField)?.label} is missing` }); return; }

      const dupKey = `${nameKey(label)}|${values.county ?? values.state ?? values.email ?? ''}`;
      if (seen.has(dupKey)) { items.push({ ...base, action: 'unchanged', problem: 'Repeats an earlier row in this file' }); return; }
      seen.add(dupKey);

      const existing = findExisting(entity, values);
      if (!existing) { items.push({ ...base, action: 'new', problem }); return; }

      const changes: Change[] = [];
      const conflicts: Change[] = [];
      for (const col of WRITABLE[entity]) {
        const incoming = values[col];
        if (incoming === null || incoming === undefined || incoming === '') continue; // blanks never erase data
        const current = existing[col] as string | number | null;
        if (same(current, incoming)) continue;
        // Never overwrite something a person already checked, and never overwrite a value with a different one on unverified rows silently for status fields owned by operators.
        if (existing.verification === 'verified' && current != null && current !== '') conflicts.push({ field: col, from: current, to: incoming });
        else changes.push({ field: col, from: current ?? null, to: incoming });
      }
      const action: PlanItem['action'] = conflicts.length ? 'conflict' : changes.length ? 'updated' : 'unchanged';
      items.push({ ...base, action, matchId: existing.id, changes, conflicts, problem });
    });
  }
  const summary = { new: 0, updated: 0, unchanged: 0, conflict: 0, invalid: 0, total: items.length };
  for (const it of items) summary[it.action]++;
  return { entity, items, summary };
}

export function resolveOrgByName(name: string | null | undefined): number | null {
  if (!name) return null;
  return get<{ id: number }>('SELECT id FROM organizations WHERE name_key = ? ORDER BY verification = \'verified\' DESC, id LIMIT 1', nameKey(name))?.id ?? null;
}

export function userByLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const n = label.trim().toLowerCase();
  return all<{ id: number; name: string; initials: string; email: string }>('SELECT id, name, initials, email FROM users').find(
    (u) => u.name.toLowerCase() === n || u.initials.toLowerCase() === n || u.email.toLowerCase() === n || u.name.toLowerCase().split(' ')[0] === n,
  )?.id ?? null;
}
