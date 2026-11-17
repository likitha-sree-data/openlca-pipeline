import { beforeEach, describe, expect, it } from 'vitest';
import { lookedNote, markLooked, programReadiness, projectReadiness, setPublished } from '../src/lib/publish';
import { ENTITIES } from '../src/lib/entities';
import { insertRow } from '../src/lib/crud';
import { get, run } from '../src/lib/db';
import { freshDb } from './helpers';

describe('project readiness', () => {
  it('blocks on place and description, advises on the rest', () => {
    const empty = projectReadiness({});
    expect(empty.canPublish).toBe(false);
    expect(empty.missingRequired.map((c) => c.key)).toEqual(['place', 'description']);
    const ok = projectReadiness({ county: 'Deschutes County', state: 'OR', description: 'Thin forty acres around the community.' });
    expect(ok.canPublish).toBe(true);
    expect(ok.missingNice.map((c) => c.key)).toEqual(['map', 'source', 'checked']);
    const full = projectReadiness({ county: 'X', state: 'OR', description: 'Thin forty acres around the community.', lat: 44, lng: -121, source_url: 'https://x.org', verification: 'verified' });
    expect(full.missingNice).toEqual([]);
  });
  it('treats a too-short description as missing', () => {
    expect(projectReadiness({ county: 'X', state: 'OR', description: 'short' }).canPublish).toBe(false);
  });
});

describe('program readiness', () => {
  const base = { run_by: 'Oregon Department of Forestry', url: 'https://www.oregon.gov/odf', eligibility: 'Small forestland owners, alone or as a group such as an HOA.' };
  it('needs who, a real link and eligibility', () => {
    expect(programReadiness(base, '2026-11-16').canPublish).toBe(true);
    expect(programReadiness({ ...base, url: 'javascript:alert(1)' }, '2026-11-16').missingRequired.map((c) => c.key)).toEqual(['link']);
    expect(programReadiness({}, '2026-11-16').missingRequired.map((c) => c.key)).toEqual(['who', 'link', 'eligibility']);
  });
  it('wants the page looked at in the last 90 days', () => {
    expect(programReadiness({ ...base, checked_at: '2026-10-01' }, '2026-11-16').checks.find((c) => c.key === 'fresh')!.ok).toBe(true);
    expect(programReadiness({ ...base, checked_at: '2026-06-01' }, '2026-11-16').checks.find((c) => c.key === 'fresh')!.ok).toBe(false);
    expect(programReadiness(base, '2026-11-16').checks.find((c) => c.key === 'fresh')!.ok).toBe(false);
  });
  it('describes how long ago in plain words', () => {
    expect(lookedNote('2026-11-16', '2026-11-16')).toEqual({ text: 'Looked at the program page today', stale: false });
    expect(lookedNote('2026-11-15', '2026-11-16').text).toBe('Looked at the program page 1 day ago');
    expect(lookedNote('2026-01-01', '2026-11-16').stale).toBe(true);
    expect(lookedNote(null).stale).toBe(true);
  });
});

describe('showing and hiding', () => {
  beforeEach(async () => { await freshDb(); await run(`INSERT INTO users (id, name, email, initials) VALUES (1, 'Op', 'op@x.org', 'OP')`); });

  it('refuses to show a project that is not ready, and says what is missing', async () => {
    const id = await insertRow(ENTITIES.projects, { name: 'Ridge break', stage: 'planning', category: 'fuels_reduction', published: 0 }, 1);
    const r = await setPublished('projects', id, true, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Add the county and state\..*Write what the work is/);
    expect((await get<{ published: number }>('SELECT published FROM projects WHERE id = ?', id))!.published).toBe(0);
  });

  it('shows a ready project, hides it again, and keeps a record of both', async () => {
    const id = await insertRow(ENTITIES.projects, { name: 'Ridge break', stage: 'planning', category: 'fuels_reduction', county: 'Deschutes County', state: 'OR', description: 'Thin forty acres around the community.', published: 0 }, 1);
    expect(await setPublished('projects', id, true, 1)).toEqual({ ok: true });
    expect((await get<{ published: number }>('SELECT published FROM projects WHERE id = ?', id))!.published).toBe(1);
    expect(await setPublished('projects', id, false, 1)).toEqual({ ok: true });
    expect((await get<{ published: number }>('SELECT published FROM projects WHERE id = ?', id))!.published).toBe(0);
    expect((await get<{ n: number }>(`SELECT COUNT(*) n FROM activities WHERE entity = 'projects' AND entity_id = ? AND body ILIKE '%website%'`, id))!.n).toBe(2);
  });

  it('hiding is always allowed, even for something that would not pass today', async () => {
    await run(`INSERT INTO projects (id, name, name_key, published) VALUES (9, 'Old', 'old', 1)`);
    expect(await setPublished('projects', 9, false, 1)).toEqual({ ok: true });
  });

  it('will not show an archived record', async () => {
    const id = await insertRow(ENTITIES.projects, { name: 'P', stage: 'planning', category: 'fuels_reduction', county: 'X', state: 'OR', description: 'Thin forty acres around the community.' }, 1);
    await run('UPDATE projects SET archived = 1 WHERE id = ?', id);
    expect((await setPublished('projects', id, true, 1)).ok).toBe(false);
  });

  it('programs: needs the official link, and "looked at" resets the clock', async () => {
    const id = await insertRow(ENTITIES.programs, { name: 'Grant', type: 'grant', scope: 'national', run_by: 'USDA', eligibility: 'Communities at risk of wildfire, including HOAs.' }, 1);
    expect((await setPublished('programs', id, true, 1)).ok).toBe(false);
    await run(`UPDATE programs SET url = 'https://www.fs.usda.gov/x' WHERE id = ?`, id);
    expect(await setPublished('programs', id, true, 1)).toEqual({ ok: true });
    expect(await markLooked(id, 1, '2026-11-16')).toBe(true);
    expect((await get<{ checked_at: string }>('SELECT checked_at FROM programs WHERE id = ?', id))!.checked_at).toBe('2026-11-16');
    expect(await markLooked(9999, 1)).toBe(false);
  });
});

import { quickFilters } from '../src/lib/quick-filters';
import { listRows } from '../src/lib/crud';
import { seedDatabase } from '../src/lib/seed';

describe('quick filters on the seeded data', () => {
  beforeEach(async () => { await freshDb(); await seedDatabase({ password: 'test-password-1' }); });
  const count = async (key: 'programs' | 'projects' | 'requests', filter: string, today = '2026-11-16') => {
    const q = quickFilters(key, today, 1)[filter];
    return (await listRows(ENTITIES[key], { extra: q, filters: {} })).total;
  };

  it('programs: open now, always open, closing soon, closed, hidden', async () => {
    expect(await count('programs', 'open')).toBe(3); // the two Forest Service windows, plus a private foundation with a future deadline
    expect(await count('programs', 'past')).toBe(3);
    expect(await count('programs', 'soon')).toBe(0);
    expect(await count('programs', 'soon', '2027-01-10')).toBe(2); // the two Forest Service windows close Jan 26
    expect(await count('programs', 'hidden')).toBe(16); // the private funders and loans
    expect(await count('programs', 'always')).toBe(32); // 17 public and 15 private programs have no dates
    expect(await count('programs', 'open') + await count('programs', 'always') + await count('programs', 'past')).toBeLessThan((await listRows(ENTITIES.programs, {})).total + 1);
  });
  it('projects: need funding, ready to show, hidden', async () => {
    expect(await count('projects', 'needs')).toBeGreaterThan(4);
    expect(await count('projects', 'ready')).toBeGreaterThanOrEqual(0);
    expect(await count('projects', 'hidden')).toBeGreaterThan(0);
    await run(`INSERT INTO projects (name, name_key, county, state, description, published) VALUES ('Ready one', 'ready one', 'X', 'OR', 'Thin forty acres around the community.', 0), ('Not ready', 'not ready', NULL, 'OR', 'Thin forty acres around the community.', 0)`);
    const before = await count('projects', 'ready');
    await run(`UPDATE projects SET published = 1 WHERE name = 'Ready one'`);
    expect(await count('projects', 'ready')).toBe(before - 1);
  });
  it('requests: nobody yet and overdue', async () => {
    expect(await count('requests', 'nobody')).toBe(32);
    expect(await count('requests', 'overdue')).toBe(0);
    expect(await count('requests', 'mine')).toBe(0);
  });
});
