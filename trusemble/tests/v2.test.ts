import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDetail, checkQueue, checkTotal, checkedByUserToday } from '../src/lib/check';
import { alertChannels, sendAlert } from '../src/lib/notify';
import { notifyNewRequest } from '../src/lib/notify-requests';
import { weeklySummary } from '../src/lib/summary';
import { needsYou, checkedShare } from '../src/lib/today';
import { groupFor, OPS_GROUPS } from '../src/lib/entities';
import { markVerified } from '../src/lib/crud';
import { ENTITIES } from '../src/lib/entities';
import { createFundingRequest } from '../src/lib/submissions';
import { run } from '../src/lib/db';
import { seedDatabase } from '../src/lib/seed';
import { freshDb } from './helpers';

const keys = ['NOTIFY_WEBHOOK_URL', 'RESEND_API_KEY', 'NOTIFY_EMAIL_FROM', 'NOTIFY_EMAIL_TO', 'SITE_URL'];
afterEach(() => { for (const k of keys) delete process.env[k]; });

describe('the five places', () => {
  it('puts every team page in exactly one place', () => {
    expect(OPS_GROUPS.map((g) => g.key)).toEqual(['today', 'people', 'projects', 'check', 'settings']);
    const cases: [string, string][] = [['/ops', 'today'], ['/ops/pilot', 'today'], ['/ops/requests', 'people'], ['/ops/requests/12', 'people'], ['/ops/contacts/new', 'people'], ['/ops/matches', 'people'],
      ['/ops/projects/3', 'projects'], ['/ops/organizations', 'projects'], ['/ops/funding/9', 'projects'], ['/ops/check', 'check'], ['/ops/imports/4', 'check'], ['/ops/data-quality', 'check'], ['/ops/sources', 'check'], ['/ops/map', 'check'], ['/ops/settings', 'settings'], ['/ops/calculator', 'settings']];
    for (const [path, key] of cases) expect(groupFor(path)?.key, path).toBe(key);
    expect(groupFor('/somewhere')).toBeNull();
  });
});

describe('check the data', () => {
  beforeEach(async () => { await freshDb(); await seedDatabase({ password: 'test-password-1' }); });

  it('queues programs first, then projects, then groups; never samples; shrinks as people check', async () => {
    const q = await checkQueue();
    expect(q[0].slug).toBe('funding');
    const order = q.map((i) => i.slug);
    expect(order.indexOf('projects')).toBeGreaterThan(order.lastIndexOf('funding'));
    expect(order.indexOf('organizations')).toBeGreaterThan(order.lastIndexOf('projects'));
    expect(q.every((i) => i.name && !/^\(Demo\)/.test(i.name))).toBe(true);
    const total = await checkTotal();
    await run(`INSERT INTO users (id, name, email, initials) VALUES (99, 'T', 't@x.org', 'T')`);
    await markVerified(ENTITIES.programs, q[0].id, 99, 'confirmed');
    expect(await checkTotal()).toBe(total - 1);
    expect((await checkQueue()).some((i) => i.slug === 'funding' && i.id === q[0].id)).toBe(false);
    expect(await checkedByUserToday(99)).toBe(1);
  });

  it('shows a record in plain words next to its source', async () => {
    const p = (await checkQueue()).find((i) => i.slug === 'funding')!;
    const d = (await checkDetail('funding', p.id))!;
    const keys = d.fields.map(([k]) => k);
    expect(keys).toContain('Run by');
    expect(keys).toContain('When you can apply');
    expect(d.source?.name).toMatch(/program pages/i);
    expect(await checkDetail('projects', 999999)).toBeNull();
  });
});

describe('Today', () => {
  beforeEach(async () => { await freshDb(); await seedDatabase({ password: 'test-password-1' }); });
  it('counts what needs a person', async () => {
    const n = await needsYou('2026-11-16');
    expect(n.noNextStep).toBe(32);
    expect(n.closing.map((c) => c.days)).toEqual([]); // nothing closes within 30 days of Nov 16
    expect((await needsYou('2027-01-01')).closing.length).toBe(2);
    expect(n.toCheck).toBe(await checkTotal());
    const s = await checkedShare();
    expect(s.total).toBeGreaterThan(0);
    expect(s.checked).toBeLessThanOrEqual(s.total);
  });
  it('sees a website request the moment it arrives', async () => {
    const before = (await needsYou()).newFromWebsiteTotal;
    await createFundingRequest({ person: { name: 'P', email: 'p@x.org' }, projectName: 'Ridge break', description: 'Thin forty acres around the community.', category: 'fuels_reduction', needs: ['Funding'] });
    const after = await needsYou();
    expect(after.newFromWebsiteTotal).toBe(before + 1);
    expect(after.newFromWebsite[0].from_name).toBe('P');
  });
});

describe('alerts', () => {
  const calls: { url: string; body: string; auth?: string }[] = [];
  const fake = (ok = true) => async (url: string, init: RequestInit) => { calls.push({ url, body: String(init.body), auth: (init.headers as Record<string, string>)?.Authorization }); return { ok, status: ok ? 200 : 500 }; };
  beforeEach(async () => { calls.length = 0; await freshDb(); });

  it('does nothing, and says so, when no alert is set up', async () => {
    expect(alertChannels()).toMatchObject({ webhook: false, email: false });
    expect(await sendAlert({ title: 'x', lines: [] }, fake())).toEqual({ sent: [], failed: [] });
    expect(calls).toHaveLength(0);
  });

  it('sends to a chat link and by email, with a link back to the team tool', async () => {
    process.env.NOTIFY_WEBHOOK_URL = 'https://hooks.example.org/abc';
    process.env.RESEND_API_KEY = 're_secret';
    process.env.NOTIFY_EMAIL_FROM = 'alerts@trusemble.example';
    process.env.NOTIFY_EMAIL_TO = 'a@x.org, b@x.org';
    process.env.SITE_URL = 'https://trusemble.example/';
    const r = await sendAlert({ title: 'New request', lines: ['Reference TS-1'], path: '/ops/requests/5' }, fake());
    expect(r.sent.sort()).toEqual(['chat or automation link', 'email']);
    expect(JSON.parse(calls[0].body).url).toBe('https://trusemble.example/ops/requests/5');
    const mail = JSON.parse(calls[1].body);
    expect(mail.to).toEqual(['a@x.org', 'b@x.org']);
    expect(calls[1].auth).toBe('Bearer re_secret');
    expect(mail.text).not.toMatch(/re_secret/);
  });

  it('never throws when sending fails', async () => {
    process.env.NOTIFY_WEBHOOK_URL = 'https://hooks.example.org/abc';
    expect((await sendAlert({ title: 'x', lines: [] }, fake(false))).failed).toEqual(['chat or automation link']);
    expect((await sendAlert({ title: 'x', lines: [] }, (async () => { throw new Error('offline'); }) as never)).failed).toEqual(['chat or automation link']);
  });

  it('a new request alert names the group and project but never contact details', async () => {
    await seedDatabase({ password: 'test-password-1' });
    const { ref } = await createFundingRequest({ person: { name: 'Pat Lee', email: 'pat.lee@private.example', phone: '555-0100', org: 'Ridge HOA' }, projectName: 'Ridge fuels break', description: 'Thin forty acres around the community.', category: 'fuels_reduction', needs: ['Funding'], amount: 75000 });
    process.env.NOTIFY_WEBHOOK_URL = 'https://hooks.example.org/abc';
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string, init: RequestInit) => { calls.push({ url: String(u), body: String(init.body) }); return { ok: true, status: 200 }; }) as never;
    try { await notifyNewRequest(ref); } finally { globalThis.fetch = real; }
    expect(calls).toHaveLength(1);
    const text = JSON.parse(calls[0].body).text as string;
    expect(text).toMatch(/Ridge HOA/);
    expect(text).toMatch(/Ridge fuels break/);
    expect(text).not.toMatch(/pat\.lee|555-0100|Pat Lee/);
  });

  it('writes a weekly summary a person can act on', async () => {
    await seedDatabase({ password: 'test-password-1' });
    const a = await weeklySummary(new Date('2026-11-16T12:00:00Z'));
    const text = a.lines.join('\n');
    expect(a.title).toBe('TruSemble weekly summary');
    expect(text).toMatch(/New requests this week: 1/); // the one inquiry received Nov 12
    expect(text).toMatch(/records are waiting to be checked/);
    expect(text).toMatch(/open requests have no next step/);
  });
});

import { markIntroduced, setNextStep } from '../src/lib/requests';
import { get } from '../src/lib/db';
import { listRows } from '../src/lib/crud';

describe('working one request', () => {
  let id = 0;
  beforeEach(async () => {
    await freshDb();
    await seedDatabase({ password: 'test-password-1' });
    await run(`INSERT INTO users (id, name, email, initials) VALUES (50, 'Mia Park', 'mia@x.org', 'MP')`);
    id = (await get<{ id: number }>(`SELECT id FROM requests WHERE ref = 'TS-2026-0038'`))!.id;
  });

  it('sets, changes and clears the next step, and keeps a record', async () => {
    expect(await setNextStep(id, { ownerId: 50, date: '2026-11-20', text: 'Email the program list' }, 50)).toEqual({ ok: true });
    expect(await get('SELECT owner_id, next_action_date, next_action FROM requests WHERE id = ?', id)).toEqual({ owner_id: 50, next_action_date: '2026-11-20', next_action: 'Email the program list' });
    expect(await setNextStep(id, { ownerId: null, date: null, text: null }, 50)).toEqual({ ok: true });
    expect(await get('SELECT owner_id, next_action_date, next_action FROM requests WHERE id = ?', id)).toEqual({ owner_id: null, next_action_date: null, next_action: null });
    expect((await get<{ n: number }>(`SELECT COUNT(*) n FROM activities WHERE entity = 'requests' AND entity_id = ? AND body ILIKE 'Next step:%'`, id))!.n).toBe(2);
  });

  it('rejects bad dates, unknown people and over-long text', async () => {
    expect((await setNextStep(id, { ownerId: null, date: '11/20/2026', text: null }, 50)).ok).toBe(false);
    expect((await setNextStep(id, { ownerId: null, date: '2026-02-31', text: null }, 50)).ok).toBe(false);
    expect((await setNextStep(id, { ownerId: 9999, date: null, text: null }, 50)).ok).toBe(false);
    expect((await setNextStep(id, { ownerId: null, date: null, text: 'x'.repeat(301) }, 50)).ok).toBe(false);
    expect((await setNextStep(987654, { ownerId: null, date: null, text: null }, 50)).ok).toBe(false);
  });

  it('records an introduction only when it says who, and schedules a follow-up', async () => {
    expect((await markIntroduced(id, 'ok', 50)).ok).toBe(false);
    expect((await get<{ status: string }>('SELECT status FROM requests WHERE id = ?', id))!.status).toBe('new');
    expect(await markIntroduced(id, 'Ridge HOA to the Bend Foundation', 50, '2026-11-16')).toEqual({ ok: true });
    const r = (await get<{ status: string; next_action_date: string; next_action: string }>('SELECT status, next_action_date, next_action FROM requests WHERE id = ?', id))!;
    expect(r).toEqual({ status: 'intro_made', next_action_date: '2026-11-23', next_action: 'Check how the introduction went' });
    expect((await get<{ body: string }>(`SELECT body FROM activities WHERE entity = 'requests' AND entity_id = ? AND kind = 'status' ORDER BY id DESC LIMIT 1`, id))!.body).toMatch(/Ridge HOA to the Bend Foundation/);
  });

  it('keeps an existing future next step when introducing', async () => {
    await setNextStep(id, { ownerId: 50, date: '2026-12-01', text: 'Call them' }, 50);
    await markIntroduced(id, 'Pat to Lee, both agreed', 50, '2026-11-16');
    expect(await get<{ d: string; t: string }>('SELECT next_action_date d, next_action t FROM requests WHERE id = ?', id)).toEqual({ d: '2026-12-01', t: 'Call them' });
  });

  it('filters requests to mine, nobody yet and overdue', async () => {
    await setNextStep(id, { ownerId: 50, date: '2026-11-01', text: 'Call' }, 50);
    const cfg = ENTITIES.requests;
    expect((await listRows(cfg, { extra: { sql: "r.owner_id = ? AND r.status != 'closed'", params: [50] } })).total).toBe(1);
    expect((await listRows(cfg, { extra: { sql: "r.owner_id IS NULL AND r.status != 'closed'", params: [] } })).total).toBe(31);
    expect((await listRows(cfg, { extra: { sql: "r.next_action_date < ? AND r.status != 'closed'", params: ['2026-11-16'] } })).total).toBe(1);
  });
});
