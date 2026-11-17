import { beforeEach, describe, expect, it } from 'vitest';
import { addToOutreach, findDuplicates, mergeOrganizations, setContactOwner, setDoNotContact } from '../src/lib/people';
import { organizationReadiness, setPublished } from '../src/lib/publish';
import { quickFilters } from '../src/lib/quick-filters';
import { listRows } from '../src/lib/crud';
import { ENTITIES } from '../src/lib/entities';
import { scanDuplicates } from '../src/lib/import/apply';
import { all, get, run } from '../src/lib/db';
import { nameKey } from '../src/lib/text';
import { seedDatabase } from '../src/lib/seed';
import { freshDb } from './helpers';

describe('merging duplicate groups', () => {
  beforeEach(async () => {
    await freshDb();
    await run(`INSERT INTO users (id, name, email, initials) VALUES (1, 'Op', 'op@x.org', 'OP')`);
    await run(`INSERT INTO organizations (id, name, name_key, type, county, state, website) VALUES (1, 'Ridge HOA', 'ridge hoa', 'other', 'Deschutes County', 'OR', NULL)`);
    await run(`INSERT INTO organizations (id, name, name_key, type, county, state, website, city) VALUES (2, 'The Ridge HOA, Inc.', ?, 'hoa', NULL, NULL, 'https://ridge.example.org', 'Bend')`, nameKey('The Ridge HOA, Inc.'));
    await run(`INSERT INTO projects (name, name_key, owner_org_id) VALUES ('Break', 'break', 2)`);
    await run(`INSERT INTO contacts (name, name_key, org_id) VALUES ('Pat', 'pat', 2), ('Lee', 'lee', 1)`);
    await run(`INSERT INTO requests (ref, from_name, from_key, org_id) VALUES ('TS-1', 'Ridge HOA', 'ridge hoa', 2)`);
    await run(`INSERT INTO awards (org_id, amount_committed) VALUES (2, 1000)`);
    await run(`INSERT INTO activities (entity, entity_id, kind, body) VALUES ('organizations', 2, 'note', 'Spoke to the chair')`);
  });

  it('does not call two same-named groups in different places duplicates', async () => {
    await run(`INSERT INTO organizations (id, name, name_key, county, state) VALUES (3, 'Alpine Acres', 'alpine acres', 'Chelan', 'WA'), (4, 'Alpine Acres', 'alpine acres', 'Summit', 'CO'), (5, 'Alpine Acres', 'alpine acres', 'Chelan', 'WA'), (6, 'Alpine Acres', 'alpine acres', NULL, NULL)`);
    expect((await findDuplicates(3)).map((d) => d.id)).toEqual([5, 6]); // same place, and one with no place yet
    expect((await findDuplicates(4)).map((d) => d.id)).toEqual([6]);
  });

  it('spots groups that are the same name', async () => {
    expect((await findDuplicates(1)).map((d) => d.id)).toEqual([2]);
    expect((await findDuplicates(2)).map((d) => d.id)).toEqual([1]);
    expect((await findDuplicates(2))[0]).toMatchObject({ projects: 0, people: 1 });
  });

  it('moves everything, fills blanks without overwriting, and archives the other', async () => {
    const r = await mergeOrganizations(2, 1, 1);
    expect(r).toEqual({ ok: true, moved: { projects: 1, people: 1, requests: 1, awards: 1, programs: 0 } });
    expect((await get<{ owner_org_id: number }>('SELECT owner_org_id FROM projects'))!.owner_org_id).toBe(1);
    expect(await all('SELECT 1 FROM contacts WHERE org_id = 1')).toHaveLength(2);
    expect((await get<{ org_id: number }>('SELECT org_id FROM requests'))!.org_id).toBe(1);
    expect((await get<{ org_id: number }>('SELECT org_id FROM awards'))!.org_id).toBe(1);
    const kept = (await get<{ website: string; city: string; county: string; type: string }>('SELECT website, city, county, type FROM organizations WHERE id = 1'))!;
    expect(kept).toEqual({ website: 'https://ridge.example.org', city: 'Bend', county: 'Deschutes County', type: 'hoa' }); // blanks filled, county kept, "other" upgraded
    const gone = (await get<{ archived: number; published: number; notes: string }>('SELECT archived, published, notes FROM organizations WHERE id = 2'))!;
    expect(gone.archived).toBe(1);
    expect(gone.notes).toMatch(/Merged into "Ridge HOA" \(#1\)/);
    expect((await get<{ entity_id: number }>(`SELECT entity_id FROM activities WHERE body = 'Spoke to the chair'`))!.entity_id).toBe(1);
    expect(await findDuplicates(1)).toEqual([]);
  });

  it('resolves the duplicate warning and refuses nonsense', async () => {
    await scanDuplicates();
    expect((await get<{ n: number }>(`SELECT COUNT(*) n FROM issues WHERE status = 'open'`))!.n).toBe(1);
    await mergeOrganizations(2, 1, 1);
    expect((await get<{ n: number }>(`SELECT COUNT(*) n FROM issues WHERE status = 'open'`))!.n).toBe(0);
    expect((await mergeOrganizations(1, 1, 1)).ok).toBe(false);
    expect((await mergeOrganizations(1, 999, 1)).ok).toBe(false);
    await run('UPDATE organizations SET archived = 1 WHERE id = 1');
    expect((await mergeOrganizations(2, 1, 1)).ok).toBe(false);
  });
});

describe('contacts', () => {
  beforeEach(async () => {
    await freshDb();
    await run(`INSERT INTO users (id, name, email, initials) VALUES (1, 'Op', 'op@x.org', 'OP'), (2, 'Mia', 'mia@x.org', 'MI')`);
    await run(`INSERT INTO contacts (id, name, name_key, email) VALUES (10, 'Pat', 'pat', 'pat@x.org')`);
  });

  it('do not contact removes them from the outreach queue unless already contacted, and can be undone', async () => {
    expect(await addToOutreach(10, 1)).toEqual({ ok: true });
    expect(await all('SELECT 1 FROM pilot_people')).toHaveLength(1);
    expect(await setDoNotContact(10, true, 'Asked not to be emailed', 1)).toBe(true);
    expect(await all('SELECT 1 FROM pilot_people')).toHaveLength(0);
    expect((await get<{ do_not_contact: number }>('SELECT do_not_contact FROM contacts WHERE id = 10'))!.do_not_contact).toBe(1);
    expect((await addToOutreach(10, 1)).ok).toBe(false);
    expect((await get<{ body: string }>(`SELECT body FROM activities WHERE entity = 'contacts' ORDER BY id DESC LIMIT 1`))!.body).toMatch(/do not contact: Asked not to be emailed/);
    await setDoNotContact(10, false, null, 1);
    expect(await addToOutreach(10, 1)).toEqual({ ok: true });
    expect(await setDoNotContact(999, true, null, 1)).toBe(false);
  });

  it('keeps a person already contacted on the list for the record', async () => {
    await addToOutreach(10, 1);
    await run(`UPDATE pilot_people SET contacted_at = now_iso()`);
    await setDoNotContact(10, true, null, 1);
    expect(await all('SELECT 1 FROM pilot_people')).toHaveLength(1);
  });

  it('sets and clears the team owner', async () => {
    expect(await setContactOwner(10, 2, 1)).toBe(true);
    expect((await get<{ owner_id: number }>('SELECT owner_id FROM contacts WHERE id = 10'))!.owner_id).toBe(2);
    expect((await get<{ body: string }>(`SELECT body FROM activities WHERE entity = 'contacts' ORDER BY id DESC LIMIT 1`))!.body).toMatch(/Mia is now the team contact/);
    expect(await setContactOwner(10, null, 1)).toBe(true);
    expect(await setContactOwner(10, 99, 1)).toBe(false);
  });
});

describe('group readiness and filters', () => {
  beforeEach(async () => { await freshDb(); await seedDatabase({ password: 'test-password-1' }); });

  it('needs a place before a group can be shown on the map', async () => {
    expect(organizationReadiness({}).canPublish).toBe(false);
    const ok = organizationReadiness({ county: 'X', state: 'OR' });
    expect(ok.canPublish).toBe(true);
    expect(ok.missingNice.map((c) => c.key)).toEqual(['kind', 'map', 'website', 'checked']);
    await run(`INSERT INTO users (id, name, email, initials) VALUES (77, 'T', 't@x.org', 'T')`);
    await run(`INSERT INTO organizations (id, name, name_key, published) VALUES (9000, 'Nowhere', 'nowhere', 0)`);
    expect((await setPublished('organizations', 9000, true, 77)).ok).toBe(false);
    await run(`UPDATE organizations SET county = 'X', state = 'OR' WHERE id = 9000`);
    expect(await setPublished('organizations', 9000, true, 77)).toEqual({ ok: true });
  });

  it('filters groups and contacts with one click', async () => {
    const c = async (key: 'organizations' | 'contacts', f: string) => (await listRows(ENTITIES[key], { extra: quickFilters(key, '2026-11-16', 1)[f] })).total;
    expect(await c('contacts', 'noreach')).toBe(4);
    expect(await c('contacts', 'dnc')).toBe(0);
    expect(await c('contacts', 'noorg')).toBe(0);
    expect(await c('organizations', 'funders')).toBeGreaterThan(5);
    expect(await c('organizations', 'communities')).toBeGreaterThan(100);
    expect(await c('organizations', 'unsorted')).toBeGreaterThan(0);
    const before = await c('organizations', 'dupes'); // generated place names collide, as real ones do
    await run(`INSERT INTO organizations (name, name_key) VALUES ('Twin', 'twin'), ('Twin', 'twin')`);
    expect(await c('organizations', 'dupes')).toBe(before + 2);
  });
});
