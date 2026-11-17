import { beforeEach, describe, expect, it } from 'vitest';
import { all, get, run } from '../src/lib/db';
import { runFetcher, pickField, type Ctx } from '../src/lib/ingest/runner';
import { centroid, nfpaFirewise, odfFuels, stateCode } from '../src/lib/ingest/arcgis';
import { grantsGov, usaSpending } from '../src/lib/ingest/federal';
import { upsertBySource } from '../src/lib/ingest/store';
import { freshDb } from './helpers';

type Fx = Ctx['fetchJson'];
const quiet = () => {};

const point = (lng: number, lat: number) => ({ type: 'Point', coordinates: [lng, lat] });
const firewise = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'Feature', id: i + 1, properties: { SITE_NAME: `Site ${i + 1}`, COUNTY: 'Deschutes', STATE: 'Oregon', CITY: 'Bend' }, geometry: point(-121.3 + i * 0.01, 44.0) }));

// Serves a list as ArcGIS pages honouring resultOffset / resultRecordCount.
const arcgis = (features: unknown[]): Fx => (async (url: string) => {
  const q = new URL(url).searchParams;
  const off = Number(q.get('resultOffset')), size = Number(q.get('resultRecordCount'));
  const page = features.slice(off, off + size);
  return { type: 'FeatureCollection', features: page, exceededTransferLimit: off + size < features.length };
}) as Fx;

describe('ingest runner', () => {
  beforeEach(async () => { await freshDb(); });

  it('pages through ArcGIS layers and is idempotent', async () => {
    const fx = arcgis(firewise(2500));
    const first = await runFetcher(nfpaFirewise, { fetchImpl: fx, log: quiet });
    expect(first.ok).toBe(true);
    expect(first.stats.new).toBe(2500);
    const o = (await get<{ type: string; state: string; published: number; verification: string; location_precision: string }>(`SELECT * FROM organizations WHERE name = 'Site 1'`))!;
    expect(o).toMatchObject({ type: 'firewise_community', state: 'OR', published: 1, verification: 'unverified', location_precision: 'community' });
    const second = await runFetcher(nfpaFirewise, { fetchImpl: fx, log: quiet });
    expect(second.stats).toMatchObject({ new: 0, unchanged: 2500 });
    expect((await get<{ n: number }>('SELECT COUNT(*) n FROM source_runs WHERE status = ?', 'ok'))!.n).toBe(2);
    expect((await get<{ last_fetched_at: string | null }>(`SELECT last_fetched_at FROM sources WHERE slug = 'nfpa-firewise'`))!.last_fetched_at).not.toBeNull();
  }, 120_000);

  it('honours --limit and records skipped rows with a reason', async () => {
    const feats = [...firewise(5), { type: 'Feature', id: 99, properties: { UNRELATED: 'x' }, geometry: null }];
    const r = await runFetcher(nfpaFirewise, { fetchImpl: arcgis(feats), log: quiet });
    expect(r.stats).toMatchObject({ new: 5, skipped: 1 });
    const limited = await runFetcher(nfpaFirewise, { limit: 2, fetchImpl: arcgis(firewise(5000)), log: quiet });
    expect(limited.stats.new + limited.stats.unchanged).toBeLessThan(5000);
  });

  it('never overwrites a row a person verified, and never erases data with blanks', async () => {
    await runFetcher(nfpaFirewise, { fetchImpl: arcgis(firewise(1)), log: quiet });
    await run(`UPDATE organizations SET verification = 'verified', county = 'Corrected County' WHERE name = 'Site 1'`);
    const changed = firewise(1).map((f) => ({ ...f, properties: { ...f.properties, COUNTY: 'Crook' } }));
    const r = await runFetcher(nfpaFirewise, { fetchImpl: arcgis(changed), log: quiet });
    expect(r.stats.unchanged).toBe(1);
    expect((await get<{ county: string }>(`SELECT county FROM organizations WHERE name = 'Site 1'`))!.county).toBe('Corrected County');
    const src = (await get<{ id: number }>(`SELECT id FROM sources WHERE slug = 'nfpa-firewise'`))!.id;
    await run(`INSERT INTO organizations (name, name_key, county, source_id, source_ref) VALUES ('B', 'b', 'Keep', ?, 'b1')`, src);
    await upsertBySource('organizations', src, 'b1', { county: '', city: 'Bend' });
    expect(await get<{ county: string; city: string }>(`SELECT county, city FROM organizations WHERE source_ref = 'b1'`)).toEqual({ county: 'Keep', city: 'Bend' });
  });

  it('builds ODF project names without landowner or staff names and drops unknown statuses', async () => {
    const feats = [
      { type: 'Feature', id: 1, properties: { ACTIVITY_TYPE: 'Thinning', UNIT_NAME: 'Central Oregon District', FISCAL_YEAR: 2022, STATUS: 'Completed', ACRES: 40, LANDOWNER: 'Jane Private', STAFF: 'Sam Staff' }, geometry: { type: 'Polygon', coordinates: [[[-121, 44], [-120, 44], [-120, 45], [-121, 45], [-121, 44]]] } },
      { type: 'Feature', id: 2, properties: { ACTIVITY_TYPE: 'Burn', UNIT_NAME: 'X', FISCAL_YEAR: 2020, STATUS: 'Unknown' }, geometry: null },
    ];
    const r = await runFetcher(odfFuels, { fetchImpl: arcgis(feats), log: quiet });
    expect(r.stats).toMatchObject({ new: 1, skipped: 1 });
    const p = (await get<{ name: string; stage: string; acres: number; lat: number }>('SELECT name, stage, acres, lat FROM projects'))!;
    expect(p).toMatchObject({ name: 'Thinning · Central Oregon District · 2022', stage: 'complete', acres: 40 });
    expect(p.lat).toBeCloseTo(44.5);
    expect(JSON.stringify(await all('SELECT * FROM projects'))).not.toMatch(/Jane|Sam/);
  });

  it('records a failed run, keeps what was saved, and keeps the error', async () => {
    let calls = 0;
    const flaky = (async (url: string) => { if (calls++ === 0) return arcgis(firewise(1000).concat(firewise(10) as never))(url); throw new Error('HTTP 500'); }) as Fx;
    const r = await runFetcher(nfpaFirewise, { fetchImpl: flaky, log: quiet });
    expect(r.ok).toBe(false);
    expect(r.stats.new).toBeGreaterThan(0);
    expect(await get<{ status: string; error: string }>('SELECT status, error FROM source_runs ORDER BY id DESC LIMIT 1')).toMatchObject({ status: 'error', error: 'HTTP 500' });
  });
});

describe('federal fetchers', () => {
  beforeEach(async () => { await freshDb(); });

  it('Grants.gov creates programs once per opportunity number', async () => {
    const fx = (async () => ({ data: { oppHits: [{ id: 123, number: 'USDA-FS-2027-01', title: 'Wildfire Resilience Grant', agency: 'Forest Service', openDate: '11/02/2026', closeDate: '01/15/2027' }, { id: 124, number: 'X-2', title: 'Another', agency: 'FEMA' }] } })) as Fx;
    const r = await runFetcher(grantsGov, { fetchImpl: fx, log: quiet });
    expect(r.stats.new).toBe(2); // the same hits repeat for each keyword but are counted once
    const p = (await get<{ window_start: string; window_end: string; rolling: number; verification: string }>(`SELECT * FROM programs WHERE source_ref = 'USDA-FS-2027-01'`))!;
    expect(p).toMatchObject({ window_start: '2026-11-02', window_end: '2027-01-15', rolling: 0, verification: 'unverified' });
    expect((await get<{ rolling: number }>(`SELECT rolling FROM programs WHERE source_ref = 'X-2'`))!.rolling).toBe(1);
  });

  it('USAspending links awards to programs by assistance listing, recipients to organizations, and county FIPS', async () => {
    await run(`INSERT INTO programs (name, name_key, type, scope, source_ref) VALUES ('BRIC', 'bric', 'grant', 'national', '97.047')`);
    const row = (n: number) => ({ 'Recipient Name': n === 1 ? 'CITY OF BEND' : 'OREGON STATE FIRE MARSHAL', 'Award Amount': 250000 * n, 'Total Outlays': n === 1 ? 100000 : null, 'Start Date': '2023-05-01', 'CFDA Number': '97.047', generated_internal_id: `ASST_${n}`, 'Primary Place of Performance': { state_code: 'OR', county_name: 'DESCHUTES', county_code: '017' } });
    const fx = (async () => ({ results: [row(1), row(2), { 'Award Amount': 5 }], page_metadata: { hasNext: false } })) as Fx;
    const r = await runFetcher(usaSpending, { fetchImpl: fx, log: quiet });
    expect(r.stats).toMatchObject({ new: 2, skipped: 1 });
    const a = (await get<{ fips: string; amount_committed: number; amount_disbursed: number | null; program_id: number; year: number }>(`SELECT a.* FROM awards a JOIN organizations o ON o.id = a.org_id WHERE o.name = 'City Of Bend'`))!;
    expect(a).toMatchObject({ fips: '41017', amount_committed: 250000, amount_disbursed: 100000, year: 2023 });
    expect(a.program_id).toBeGreaterThan(0);
    const again = await runFetcher(usaSpending, { fetchImpl: fx, log: quiet });
    expect(again.stats).toMatchObject({ new: 0, unchanged: 2 });
  });
});

describe('ingest helpers', () => {
  it('picks fields case-insensitively and maps states', () => {
    expect(pickField({ site_name: ' A ' }, ['SITE_NAME'])).toBe('A');
    expect(pickField({ a: '' }, ['a'])).toBeNull();
    expect(stateCode('Oregon')).toBe('OR');
    expect(stateCode('or')).toBe('OR');
    expect(stateCode('Atlantis')).toBeNull();
  });
  it('finds polygon centres', () => {
    expect(centroid({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]]] })).toEqual({ lat: 2, lng: 1 });
    expect(centroid(null)).toBeNull();
  });
});
