import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/lib/seed';
import { overview } from '../src/lib/ops-stats';
import { countyStats, dataCharts, getProject, headline, listProjects, listPrograms, mapGrid, sourcesLedger } from '../src/lib/public-data';
import { all, get, run, scalar } from '../src/lib/db';
import { windowStatus } from '../src/lib/programs';
import { scorecard } from '../src/lib/pilot';
import { freshDb } from './helpers';

beforeAll(() => { freshDb(); seedDatabase({ password: 'test-password-1' }); });
afterEach(() => { delete process.env.PUBLIC_INCLUDE_DEMO; });

describe('seed matches the reference screens', () => {
  it('has the 33-request pipeline with the same status split', () => {
    const o = overview('2026-11-16');
    expect(o.byStatus.rows.map((r) => [r.key, r.n])).toEqual([['new', 12], ['needs_info', 0], ['qualified', 9], ['matching', 10], ['intro_made', 1], ['closed', 1]]);
    expect(o.cards.openRequests.total).toBe(32);
    expect(o.followups.noDate.total).toBe(32);
  });
  it('has 22 published programs: 2 open, 17 rolling, 3 past', () => {
    process.env.PUBLIC_INCLUDE_DEMO = 'true';
    const progs = listPrograms();
    expect(progs).toHaveLength(22);
    const c = { open: 0, rolling: 0, upcoming: 0, past: 0 };
    for (const p of progs) c[windowStatus(p, '2026-11-16')]++;
    expect(c).toEqual({ open: 2, rolling: 17, upcoming: 0, past: 3 });
    expect(progs.filter((p) => p.verification === 'verified')).toHaveLength(1);
  });
  it('contains no personal contact details', () => {
    expect(scalar<number>(`SELECT COUNT(*) FROM contacts WHERE email IS NOT NULL OR phone IS NOT NULL`)).toBe(0);
  });
  it('registers the sources ledger without claiming rows it has not fetched', () => {
    const real = all<{ slug: string; n: number }>(`SELECT s.slug, (SELECT COUNT(*) FROM projects WHERE source_id = s.id) n FROM sources s WHERE s.slug IN ('usaspending','openfema-hma','fs-facts')`);
    expect(real.every((r) => r.n === 0)).toBe(true);
    expect(scalar<number>(`SELECT COUNT(*) FROM sources WHERE last_fetched_at IS NOT NULL`)).toBe(0);
  });
});

describe('public visibility', () => {
  it('hides demo rows unless switched on, and never exposes private or archived rows', () => {
    const real = listProjects({}, 100, 0).total;
    process.env.PUBLIC_INCLUDE_DEMO = 'true';
    const withDemo = listProjects({}, 100, 0).total;
    expect(withDemo).toBeGreaterThan(real);
    expect(real).toBe(4); // only the four Deschutes applications are non-demo
    const priv = get<{ id: number }>(`SELECT id FROM projects WHERE published = 0 LIMIT 1`);
    if (priv) expect(getProject(priv.id)).toBeNull();
    expect(headline().projects).toBe(withDemo);
  });
  it('never lets the public ledger list private sources', () => {
    expect(sourcesLedger().some((s) => /fups|kickoff/i.test(s.name))).toBe(false);
  });
  it('builds a grid and a funding gap from demo data', () => {
    process.env.PUBLIC_INCLUDE_DEMO = 'true';
    const g = mapGrid({}, null, 4);
    expect(g.features.length).toBeGreaterThan(10);
    const { gapCount, riskCutoff, counties } = countyStats();
    expect(riskCutoff).not.toBeNull();
    expect(gapCount).toBeGreaterThan(0);
    expect(counties.filter((c) => c.gap).every((c) => c.awards === 0 && (c.risk ?? 0) >= riskCutoff!)).toBe(true);
    expect(dataCharts().funders.length).toBeGreaterThan(0);
  });
  it('does not count demo rows toward the pilot', () => {
    const sc = scorecard(new Date('2026-11-12T12:00:00Z'))!;
    const data = sc.cards.find((c) => c.lane === 'data')!;
    expect(data.metrics.find((m) => m.key === 'new_records')!.value).toBe(0); // seeded rows predate the pilot
    run(`INSERT INTO organizations (name, name_key, verification) VALUES ('Fetched during the pilot', 'fetched during the pilot', 'unverified')`);
    expect(scorecard(new Date('2026-11-12T12:00:00Z'))!.cards.find((c) => c.lane === 'data')!.metrics.find((m) => m.key === 'new_records')!.value).toBe(1);
    expect(data.metrics.find((m) => m.key === 'sources_pulled')!.value).toBe(0);
    expect(sc.cards.find((c) => c.lane === 'validation')!.metrics[0].status).toBe('Awaiting acceptance');
  });
});
