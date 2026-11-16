import { beforeEach, describe, expect, it } from 'vitest';
import { applyPlan, scanDuplicates } from '../src/lib/import/apply';
import { buildPlan, normUrl, toIsoDate, typedValues, type Mapping } from '../src/lib/import/plan';
import { guessEntity, guessMapping, enumValue } from '../src/lib/import/fields';
import { parseCsv } from '../src/lib/import/parse';
import { all, get, run } from '../src/lib/db';
import { freshDb } from './helpers';

const csv = `Organization,Type,Website,County,State
Alpine Fire District,Fire District,alpinefire.org,Chaffee,Colorado
Cedar Ridge Firewise,Firewise,,Deschutes,OR
,Nonprofit,x.org,,
`;

function mappingFor(entity: 'organizations', sheet = parseCsv(csv)): Mapping {
  return { entity, sheets: { [sheet.name]: { include: true, columns: guessMapping(entity, sheet.headers) } } };
}

describe('import mapping', () => {
  it('guesses entity and columns from headers', () => {
    const s = parseCsv(csv);
    expect(guessEntity(['Sheet1'], [s.headers])).toBe('organizations');
    expect(guessMapping('organizations', s.headers)).toMatchObject({ Organization: 'name', Type: 'type', Website: 'website', County: 'county', State: 'state' });
    expect(guessEntity(['Contact Tracker', 'DNC'], [])).toBe('requests');
  });
  it('normalises values', () => {
    expect(enumValue('state', 'Colorado')).toBe('CO');
    expect(enumValue('type', 'Fire District')).toBe('fire_district');
    expect(enumValue('status', 'Applied')).toBe('matching');
    expect(normUrl('alpinefire.org')).toBe('https://alpinefire.org');
    expect(normUrl('not a url')).toBeNull();
    expect(toIsoDate('6/29/26')).toBe('2026-06-29');
    expect(typedValues('contacts', { name: 'A', email: 'bad' }).problem).toMatch(/Invalid email/);
  });
  it('parses quoted CSV and de-duplicates headers', () => {
    const s = parseCsv('a,a,b\n"x, y",2,3\n');
    expect(s.headers).toEqual(['a', 'a (2)', 'b']);
    expect(s.rows[0]).toEqual({ a: 'x, y', 'a (2)': '2', b: '3' });
  });
});

describe('import plan and apply', () => {
  beforeEach(() => { freshDb(); run(`INSERT INTO users (id, name, email, initials) VALUES (1, 'Op', 'op@x.org', 'OP')`); run(`INSERT INTO imports (id, filename) VALUES (1, 'orgs.csv')`); });

  it('is idempotent: the second run changes nothing', () => {
    const sheet = parseCsv(csv);
    const plan1 = buildPlan('organizations', [sheet], mappingFor('organizations', sheet));
    expect(plan1.summary).toMatchObject({ new: 2, invalid: 1, unchanged: 0 });
    const res = applyPlan(plan1, { userId: 1, importId: 1, filename: 'orgs.csv' });
    expect(res.new).toBe(2);
    expect(all('SELECT 1 FROM organizations')).toHaveLength(2);
    const plan2 = buildPlan('organizations', [sheet], mappingFor('organizations', sheet));
    expect(plan2.summary).toMatchObject({ new: 0, updated: 0, unchanged: 2, invalid: 1 });
    applyPlan(plan2, { userId: 1, importId: 1, filename: 'orgs.csv' });
    expect(all('SELECT 1 FROM organizations')).toHaveLength(2);
  });

  it('imports as unverified and unpublished, and never erases data with blanks', () => {
    const sheet = parseCsv(csv);
    applyPlan(buildPlan('organizations', [sheet], mappingFor('organizations', sheet)), { userId: 1, importId: 1, filename: 'orgs.csv' });
    const o = get<{ verification: string; published: number; website: string; state: string; type: string }>(`SELECT * FROM organizations WHERE name = 'Alpine Fire District'`)!;
    expect(o).toMatchObject({ verification: 'unverified', published: 0, website: 'https://alpinefire.org', state: 'CO', type: 'fire_district' });
    const blank = parseCsv('Organization,Website,State\nAlpine Fire District,,CO\n');
    const plan = buildPlan('organizations', [blank], mappingFor('organizations', blank));
    expect(plan.summary.unchanged).toBe(1);
  });

  it('turns a clash with a verified record into an issue instead of overwriting', () => {
    const sheet = parseCsv(csv);
    applyPlan(buildPlan('organizations', [sheet], mappingFor('organizations', sheet)), { userId: 1, importId: 1, filename: 'orgs.csv' });
    run(`UPDATE organizations SET verification = 'verified' WHERE name = 'Alpine Fire District'`);
    const next = parseCsv('Organization,Website,State\nAlpine Fire District,https://other.example,CO\n');
    const plan = buildPlan('organizations', [next], mappingFor('organizations', next));
    expect(plan.summary.conflict).toBe(1);
    applyPlan(plan, { userId: 1, importId: 1, filename: 'orgs.csv' });
    expect(get<{ website: string }>(`SELECT website FROM organizations WHERE name = 'Alpine Fire District'`)!.website).toBe('https://alpinefire.org');
    const issue = get<{ kind: string; field: string; incoming_value: string }>('SELECT * FROM issues')!;
    expect(issue).toMatchObject({ kind: 'conflict', field: 'website', incoming_value: 'https://other.example' });
  });

  it('creates linked organizations and contacts for pipeline rows, honouring do-not-contact sheets', () => {
    const sheet = { name: 'DNC', headers: ['Organization', 'Contact', 'Email', 'Status'], rows: [{ Organization: 'Acme Fund', Contact: 'Pat Lee', Email: 'pat@acme.org', Status: 'Applied' }] };
    const m: Mapping = { entity: 'requests', sheets: { DNC: { include: true, columns: guessMapping('requests', sheet.headers) } } };
    const res = applyPlan(buildPlan('requests', [sheet], m), { userId: 1, importId: 1, filename: 'fups.xlsx' });
    expect(res).toMatchObject({ new: 1, orgsCreated: 1, contactsCreated: 1 });
    expect(get<{ do_not_contact: number }>(`SELECT do_not_contact FROM contacts WHERE email = 'pat@acme.org'`)!.do_not_contact).toBe(1);
    expect(get<{ status: string; verification: string }>('SELECT status, verification FROM requests')).toMatchObject({ status: 'matching', verification: 'unverified' });
  });

  it('flags duplicate organizations once', () => {
    run(`INSERT INTO organizations (name, name_key, county) VALUES ('Alpine Acres', 'alpine acres', 'Chelan'), ('Alpine Acres', 'alpine acres', NULL), ('Alpine Acres', 'alpine acres', 'Summit')`);
    expect(scanDuplicates()).toBeGreaterThan(0);
    expect(scanDuplicates()).toBe(0);
  });
});
