import { beforeEach, describe, expect, it } from 'vitest';
import { ENTITIES } from '../src/lib/entities';
import { insertRow, listRows, markVerified, nextRef, parseFields, updateRow } from '../src/lib/crud';
import { all, get, run } from '../src/lib/db';
import { freshDb } from './helpers';

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] });

describe('parseFields', () => {
  it('validates and normalises', () => {
    const ok = parseFields(ENTITIES.contacts.fields, form({ name: ' Ada ', email: 'ADA@Example.org', phone: '' }));
    expect(ok.ok).toBe(true);
    if (ok.ok) { expect(ok.data.name).toBe('Ada'); expect(ok.data.email).toBe('ada@example.org'); expect(ok.data.phone).toBeNull(); expect(ok.data.do_not_contact).toBe(0); }
    const bad = parseFields(ENTITIES.contacts.fields, form({ name: '', email: 'nope' }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['email', 'name']);
  });
  it('rejects bad coordinates, urls, enums and numbers', () => {
    const r = parseFields(ENTITIES.projects.fields, form({ name: 'P', stage: 'hacked', category: 'fuels_reduction', lat: '95', lng: '10', source_url: 'javascript:alert(1)', requested_amount: '12abc' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['lat', 'requested_amount', 'source_url', 'stage']);
  });
  it('accepts $ and commas in amounts', () => {
    const r = parseFields(ENTITIES.projects.fields, form({ name: 'P', stage: 'planning', category: 'fuels_reduction', requested_amount: '$12,500' }));
    expect(r.ok && r.data.requested_amount).toBe(12500);
  });
});

describe('records', () => {
  beforeEach(async () => { await freshDb(); await run(`INSERT INTO users (id, name, email, initials) VALUES (1, 'Op', 'op@x.org', 'OP')`); });

  it('creates requests with sequential references and logs activity', async () => {
    const cfg = ENTITIES.requests;
    const y = new Date().getUTCFullYear();
    const a = await insertRow(cfg, { from_name: 'A', kind: 'client', status: 'new' }, 1);
    const b = await insertRow(cfg, { from_name: 'B', kind: 'client', status: 'new' }, 1);
    expect((await get<{ ref: string }>('SELECT ref FROM requests WHERE id = ?', a))!.ref).toBe(`TS-${y}-0001`);
    expect((await get<{ ref: string }>('SELECT ref FROM requests WHERE id = ?', b))!.ref).toBe(`TS-${y}-0002`);
    expect(await nextRef(y)).toBe(`TS-${y}-0003`);
    expect(await all('SELECT 1 FROM activities WHERE entity = ?', 'requests')).toHaveLength(2);
  });

  it('tracks status changes and only reports real edits', async () => {
    const cfg = ENTITIES.requests;
    const id = await insertRow(cfg, { from_name: 'A', kind: 'client', status: 'new' }, 1);
    expect(await updateRow(cfg, id, { from_name: 'A', kind: 'client', status: 'new' }, 1)).toEqual([]);
    const changed = await updateRow(cfg, id, { from_name: 'A', kind: 'client', status: 'closed' }, 1);
    expect(changed).toContain('status');
    const r = (await get<{ closed_at: string | null }>('SELECT closed_at FROM requests WHERE id = ?', id))!;
    expect(r.closed_at).not.toBeNull();
    expect((await get<{ n: number }>(`SELECT COUNT(*) n FROM activities WHERE kind = 'status'`))!.n).toBe(1);
  });

  it('derives program window and place', async () => {
    const id = await insertRow(ENTITIES.programs, { name: 'Rolling grant', type: 'grant', scope: 'state', state: 'OR' }, 1);
    const p = (await get<{ rolling: number; where_label: string }>('SELECT rolling, where_label FROM programs WHERE id = ?', id))!;
    expect(p.rolling).toBe(1);
    expect(p.where_label).toBe('Oregon (statewide)');
  });

  it('lists with search, filters and a verification split that ignores the verification filter', async () => {
    for (const [n, v] of [['Alpine Acres', 'unverified'], ['Alder Creek', 'verified'], ['Beech Hollow', 'demo']] as const) {
      await insertRow(ENTITIES.organizations, { name: n, type: 'firewise_community', published: 1 }, 1, { verification: v });
    }
    const all3 = await listRows(ENTITIES.organizations, { q: 'al' });
    expect(all3.total).toBe(2);
    const onlyVerified = await listRows(ENTITIES.organizations, { verification: 'verified' });
    expect(onlyVerified.total).toBe(1);
    expect(onlyVerified.counts).toEqual({ verified: 1, unverified: 1, demo: 1 });
    expect((await listRows(ENTITIES.organizations, { filters: { type: 'county' } })).total).toBe(0);
  });

  it('markVerified records a review for the pilot', async () => {
    const id = await insertRow(ENTITIES.organizations, { name: 'X', type: 'other' }, 1);
    await markVerified(ENTITIES.organizations, id, 1, 'corrected', 'fixed county');
    expect((await get<{ verification: string }>('SELECT verification FROM organizations WHERE id = ?', id))!.verification).toBe('verified');
    expect((await get<{ outcome: string }>('SELECT outcome FROM record_reviews'))!.outcome).toBe('corrected');
  });
});

describe('db helpers', () => {
  it('returns plain objects so rows can cross the server/client boundary', async () => {
    await freshDb();
    await run(`INSERT INTO users (name, email, initials) VALUES ('A', 'a@x.org', 'A')`);
    const row = (await all<{ name: string }>('SELECT name FROM users'))[0];
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(Object.getPrototypeOf((await get('SELECT * FROM users'))!)).toBe(Object.prototype);
  });
});

import { isRealDate } from '../src/lib/format';
describe('dates', () => {
  it('accepts only real calendar dates', () => {
    for (const ok of ['2026-11-16', '2024-02-29', '2026-12-31']) expect(isRealDate(ok)).toBe(true);
    for (const bad of ['2026-02-31', '2026-02-29', '2026-13-01', '2026-00-10', '11/16/2026', '2026-1-1', '', 'tomorrow']) expect(isRealDate(bad)).toBe(false);
  });
  it('is enforced by form validation', () => {
    const r = parseFields(ENTITIES.requests.fields, { get: (k: string) => ({ from_name: 'A', kind: 'client', status: 'new', next_action_date: '2026-02-31' } as Record<string, string>)[k] });
    expect(r.ok).toBe(false);
  });
});
