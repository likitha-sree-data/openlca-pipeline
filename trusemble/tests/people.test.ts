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
  beforeEach(() => {
    freshDb();
    run(`INSERT INTO users (id, name, email, initials) VALUES (1, 'Op', 'op@x.org', 'OP')`);
    run(`INSERT INTO organizations (id, name, name_key, type, county, state, website) VALUES (1, 'Ridge HOA', 'ridge hoa', 'other', 'Deschutes County', 'OR', NULL)`);
    run(`INSERT INTO organizations (id, name, name_key, type, county, state, website, city) VALUES (2, 'The Ridge HOA, Inc.', ?, 'hoa', NULL, NULL, 'https://ridge.example.org', 'Bend')`, nameKey('The Ridge HOA, Inc.'));
    run(`INSERT INTO projects (name, name_key, owner_org_id) VALUES ('Break', 'break', 2)`);
    run(`INSERT INTO contacts (name, name_key, org_id) VALUES ('Pat', 'pat', 2), ('Lee', 'lee', 1)`);
    run(`INSERT INTO requests (ref, from_name, from_key, org_id) VALUES ('TS-1', 'Ridge HOA', 'ridge hoa', 2)`);
    run(`INSERT INTO awards (org_id, amount_committed) VALUES (2, 1000)`);
    run(`INSERT INTO activities (entity, entity_id, kind, body) VALUES ('organizations', 2, 'note', 'Spoke to the chair')`);
  });

  it('does not call two same-named groups in different places duplicates', () => {
    run(`INSERT INTO organizations (id, name, name_key, county, state) VALUES (3, 'Alpine Acres', 'alpine acres', 'Chelan', 'WA'), (4, 'Alpine Acres', 'alpine acres', 'Summit', 'CO'), (5, 'Alpine Acres', 'alpine acres', 'Chelan', 'WA'), (6, 'Alpine Acres', 'alpine acres', NULL, NULL)`);
    expect(findDuplicates(3).map((d) => d.id)).toEqual([5, 6]); // same place, and one with no place yet
    expect(findDuplicates(4).map((d) => d.id)).toEqual([6]);
  });

  it('spots groups that are the same name', () => {
    expect(findDuplicates(1).map((d) => d.id)).toEqual([2]);
    expect(findDuplicates(2).map((d) => d.id)).toEqual([1]);
    expect(findDuplicates(2)[0]).toMatchObject({ projects: 0, people: 1 });
  });

  it('moves everything, fills blanks without overwriting, and archives the other', () => {
    const r = mergeOrganizations(2, 1, 1);
    expect(r).toEqual({ ok: true, moved: { projects: 1, people: 1, requests: 1, awards: 1, programs: 0 } });
    expect(get<{ owner_org_id: number }>('SELECT owner_org_id FROM projects')!.owner_org_id).toBe(1);
    expect(all('SELECT 1 FROM contacts WHERE org_id = 1')).toHaveLength(2);
    expect(get<{ org_id: number }>('SELECT org_id FROM requests')!.org_id).toBe(1);
    expect(get<{ org_id: number }>('SELECT org_id FROM awards')!.org_id).toBe(1);
    const kept = get<{ website: string; city: string; county: string; type: string }>('SELECT website, city, county, type FROM organizations WHERE id = 1')!;
    expect(kept).toEqual({ website: 'https://ridge.example.org', city: 'Bend', county: 'Deschutes County', type: 'hoa' }); // blanks filled, county kept, "other" upgraded
    const gone = get<{ archived: number; published: number; notes: string }>('SELECT archived, published, notes FROM organizations WHERE id = 2')!;
    expect(gone.archived).toBe(1);
    expect(gone.notes).toMatch(/Merged into "Ridge HOA" \(#1\)/);
    expect(get<{ entity_id: number }>(`SELECT entity_id FROM activities WHERE body = 'Spoke to the chair'`)!.entity_id).toBe(1);
    expect(findDuplicates(1)).toEqual([]);
  });

  it('resolves the duplicate warning and refuses nonsense', () => {
    scanDuplicates();
    expect(get<{ n: number }>(`SELECT COUNT(*) n FROM issues WHERE status = 'open'`)!.n).toBe(1);
    mergeOrganizations(2, 1, 1);
    expect(get<{ n: number }>(`SELECT COUNT(*) n FROM issues WHERE status = 'open'`)!.n).toBe(0);
    expect(mergeOrganizations(1, 1, 1).ok).toBe(false);
    expect(mergeOrganizations(1, 999, 1).ok).toBe(false);
    run('UPDATE organizations SET archived = 1 WHERE id = 1');
    expect(mergeOrganizations(2, 1, 1).ok).toBe(false);
  });
});

describe('contacts', () => {
  beforeEach(() => {
    freshDb();
    run(`INSERT INTO users (id, name, email, initials) VALUES (1, 'Op', 'op@x.org', 'OP'), (2, 'Mia', 'mia@x.org', 'MI')`);
    run(`INSERT INTO contacts (id, name, name_key, email) VALUES (10, 'Pat', 'pat', 'pat@x.org')`);
  });

  it('do not contact removes them from the outreach queue unless already contacted, and can be undone', () => {
    expect(addToOutreach(10, 1)).toEqual({ ok: true });
    expect(all('SELECT 1 FROM pilot_people')).toHaveLength(1);
    expect(setDoNotContact(10, true, 'Asked not to be emailed', 1)).toBe(true);
    expect(all('SELECT 1 FROM pilot_people')).toHaveLength(0);
    expect(get<{ do_not_contact: number }>('SELECT do_not_contact FROM contacts WHERE id = 10')!.do_not_contact).toBe(1);
    expect(addToOutreach(10, 1).ok).toBe(false);
    expect(get<{ body: string }>(`SELECT body FROM activities WHERE entity = 'contacts' ORDER BY id DESC LIMIT 1`)!.body).toMatch(/do not contact: Asked not to be emailed/);
    setDoNotContact(10, false, null, 1);
    expect(addToOutreach(10, 1)).toEqual({ ok: true });
    expect(setDoNotContact(999, true, null, 1)).toBe(false);
  });

  it('keeps a person already contacted on the list for the record', () => {
    addToOutreach(10, 1);
    run(`UPDATE pilot_people SET contacted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    setDoNotContact(10, true, null, 1);
    expect(all('SELECT 1 FROM pilot_people')).toHaveLength(1);
  });

  it('sets and clears the team owner', () => {
    expect(setContactOwner(10, 2, 1)).toBe(true);
    expect(get<{ owner_id: number }>('SELECT owner_id FROM contacts WHERE id = 10')!.owner_id).toBe(2);
    expect(get<{ body: string }>(`SELECT body FROM activities WHERE entity = 'contacts' ORDER BY id DESC LIMIT 1`)!.body).toMatch(/Mia is now the team contact/);
    expect(setContactOwner(10, null, 1)).toBe(true);
    expect(setContactOwner(10, 99, 1)).toBe(false);
  });
});

describe('group readiness and filters', () => {
  beforeEach(() => { freshDb(); seedDatabase({ password: 'test-password-1' }); });

  it('needs a place before a group can be shown on the map', () => {
    expect(organizationReadiness({}).canPublish).toBe(false);
    const ok = organizationReadiness({ county: 'X', state: 'OR' });
    expect(ok.canPublish).toBe(true);
    expect(ok.missingNice.map((c) => c.key)).toEqual(['kind', 'map', 'website', 'checked']);
    run(`INSERT INTO users (id, name, email, initials) VALUES (77, 'T', 't@x.org', 'T')`);
    run(`INSERT INTO organizations (id, name, name_key, published) VALUES (9000, 'Nowhere', 'nowhere', 0)`);
    expect(setPublished('organizations', 9000, true, 77).ok).toBe(false);
    run(`UPDATE organizations SET county = 'X', state = 'OR' WHERE id = 9000`);
    expect(setPublished('organizations', 9000, true, 77)).toEqual({ ok: true });
  });

  it('filters groups and contacts with one click', () => {
    const c = (key: 'organizations' | 'contacts', f: string) => listRows(ENTITIES[key], { extra: quickFilters(key, '2026-11-16', 1)[f] }).total;
    expect(c('contacts', 'noreach')).toBe(4);
    expect(c('contacts', 'dnc')).toBe(0);
    expect(c('contacts', 'noorg')).toBe(0);
    expect(c('organizations', 'funders')).toBeGreaterThan(5);
    expect(c('organizations', 'communities')).toBeGreaterThan(100);
    expect(c('organizations', 'unsorted')).toBeGreaterThan(0);
    const before = c('organizations', 'dupes'); // generated place names collide, as real ones do
    run(`INSERT INTO organizations (name, name_key) VALUES ('Twin', 'twin'), ('Twin', 'twin')`);
    expect(c('organizations', 'dupes')).toBe(before + 2);
  });
});
