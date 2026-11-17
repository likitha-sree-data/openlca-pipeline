import { beforeEach, describe, expect, it } from 'vitest';
import { generateMatches, scoreMatch } from '../src/lib/matches';
import { createFundingRequest, createIntroductionRequest, createInquiry } from '../src/lib/submissions';
import { all, get, run } from '../src/lib/db';
import { freshDb } from './helpers';

const today = '2026-11-16';
const program = { id: 1, name: 'Deschutes fuels grant', focus: 'Fuels reduction, Defensible space', scope: 'counties', state: 'OR', counties: 'Deschutes', window_start: '2026-10-01', window_end: '2027-01-01', rolling: 0, award_min: null, award_max: 5000 };
const project = { id: 1, name: 'Tetherow', category: 'fuels_reduction', county: 'Deschutes County', state: 'OR', requested_amount: 4000, stage: 'seeking_funding' };

describe('match scoring', () => {
  it('suggests a program that covers the place, is open, and pays for the work', () => {
    const s = scoreMatch(project, program, today)!;
    expect(s.score).toBeGreaterThanOrEqual(6);
    expect(s.reason).toMatch(/Deschutes County/);
    expect(s.reason).toMatch(/window open/);
  });
  it('never suggests past windows, wrong places or unrelated work', () => {
    expect(scoreMatch(project, { ...program, window_end: '2026-01-01' }, today)).toBeNull();
    expect(scoreMatch({ ...project, county: 'Lane County' }, program, today)).toBeNull();
    expect(scoreMatch(project, { ...program, focus: 'Staffing' }, today)).toBeNull();
  });
});

describe('generateMatches', () => {
  beforeEach(async () => { await freshDb(); });
  it('keeps decisions when refreshed and replaces stale suggestions', async () => {
    await run(`INSERT INTO programs (id, name, name_key, type, focus, scope, state, counties, window_end, verification) VALUES (1, 'P', 'p', 'grant', 'Fuels reduction', 'counties', 'OR', 'Deschutes', '2027-01-01', 'unverified')`);
    await run(`INSERT INTO projects (id, name, name_key, stage, category, county, state) VALUES (1, 'T', 't', 'seeking_funding', 'fuels_reduction', 'Deschutes County', 'OR')`);
    expect((await generateMatches(today)).added).toBe(1);
    await run(`UPDATE matches SET status = 'accepted'`);
    expect((await generateMatches(today)).added).toBe(0);
    expect(await all('SELECT * FROM matches')).toHaveLength(1);
    expect((await get<{ status: string }>('SELECT status FROM matches'))!.status).toBe('accepted');
  });
});

describe('public submissions', () => {
  beforeEach(async () => { await freshDb(); });
  const person = { name: 'Pat Lee', email: 'Pat@Example.org', phone: '555', org: 'Ridge HOA', role: 'Chair' };

  it('stores a funding request as private, unverified rows and a new request', async () => {
    const { ref } = await createFundingRequest({ person, projectName: 'Ridge fuels break', description: 'Thin 40 acres around the community.', state: 'OR', county: 'Deschutes', category: 'fuels_reduction', needs: ['Funding'], amount: 75000 });
    expect(ref).toMatch(/^TS-\d{4}-0001$/);
    const p = (await get<{ published: number; stage: string; verification: string }>('SELECT published, stage, verification FROM projects'))!;
    expect(p).toMatchObject({ published: 0, stage: 'seeking_funding', verification: 'unverified' });
    const r = (await get<{ kind: string; status: string; origin: string; amount_text: string }>('SELECT * FROM requests'))!;
    expect(r).toMatchObject({ kind: 'funding_request', status: 'new', origin: 'public_form', amount_text: '$75,000' });
    expect((await get<{ email: string }>('SELECT email FROM contacts'))!.email).toBe('pat@example.org');
    expect((await get<{ published: number }>('SELECT published FROM organizations'))!.published).toBe(0);
  });

  it('reuses the contact and organization on a second submission', async () => {
    await createInquiry({ person, topic: 'Something else', message: 'Hello there, team.' });
    await createInquiry({ person, topic: 'Something else', message: 'Hello again, team.' });
    expect(await all('SELECT 1 FROM contacts')).toHaveLength(1);
    expect(await all('SELECT 1 FROM organizations')).toHaveLength(1);
    expect(await all('SELECT 1 FROM requests')).toHaveLength(2);
  });

  it('only allows introductions to published projects', async () => {
    await run(`INSERT INTO projects (id, name, name_key, published) VALUES (1, 'Hidden', 'hidden', 0), (2, 'Shown', 'shown', 1)`);
    await expect(createIntroductionRequest({ person, projectId: 1, side: 'Funder', message: '' })).rejects.toThrow();
    expect((await createIntroductionRequest({ person, projectId: 2, side: 'Funder', message: 'Interested' })).ref).toBeTruthy();
    expect((await get<{ project_id: number }>('SELECT project_id FROM requests'))!.project_id).toBe(2);
  });
});
