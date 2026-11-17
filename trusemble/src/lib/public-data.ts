import { all, get, scalar, type Param } from './db';
import { includeDemo, publicRows } from './visibility';
import { aggregateGrid, cellForZoom, type GridFeature } from './grid';
import { programCoversCounty, windowStatus, type WindowStatus } from './programs';
import { todayIso } from './format';

const demoClause = (alias: string) => (includeDemo() ? '' : ` AND ${alias}.verification != 'demo'`);

// ---------- projects ----------
export type ProjectFilters = { q?: string; category?: string; stage?: string; state?: string; county?: string };

function projectWhere(f: ProjectFilters, alias = 'p') {
  const parts = [publicRows(alias)];
  const params: Param[] = [];
  if (f.q) {
    parts.push(`(${alias}.name ILIKE ? OR ${alias}.county ILIKE ? OR o.name ILIKE ?)`);
    const like = `%${f.q.replace(/[%_]/g, '')}%`;
    params.push(like, like, like);
  }
  if (f.category) { parts.push(`${alias}.category = ?`); params.push(f.category); }
  if (f.stage) { parts.push(`${alias}.stage = ?`); params.push(f.stage); }
  if (f.state) { parts.push(`${alias}.state = ?`); params.push(f.state); }
  if (f.county) { parts.push(`${alias}.county = ?`); params.push(f.county); }
  return { where: parts.join(' AND '), params };
}

export type PublicProject = {
  id: number; name: string; stage: string; category: string; county: string | null; state: string | null;
  lat: number | null; lng: number | null; location_precision: string | null; owner: string | null; verification: string;
};

export async function listProjects(f: ProjectFilters, limit = 50, offset = 0) {
  const { where, params } = projectWhere(f);
  const base = `FROM projects p LEFT JOIN organizations o ON o.id = p.owner_org_id WHERE ${where}`;
  const total = await scalar<number>(`SELECT COUNT(*) ${base}`, ...params);
  const notOnMap = await scalar<number>(`SELECT COUNT(*) ${base} AND p.lat IS NULL`, ...params);
  const stages = await all<{ stage: string; n: number }>(`SELECT p.stage, COUNT(*) n ${base} GROUP BY p.stage`, ...params);
  const items = await all<PublicProject>(
    `SELECT p.id, p.name, p.stage, p.category, p.county, p.state, p.lat, p.lng, p.location_precision,
            o.name AS owner, p.verification
     ${base}
     ORDER BY CASE p.stage WHEN 'seeking_funding' THEN 0 ELSE 1 END, lower(p.name)
     LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  return {
    total,
    onMap: total - notOnMap,
    notOnMap,
    stages: Object.fromEntries(stages.map((s) => [s.stage, s.n])) as Record<string, number>,
    items,
  };
}

export async function projectFilterOptions() {
  const w = publicRows('p');
  return {
    states: (await all<{ state: string }>(`SELECT DISTINCT state FROM projects p WHERE ${w} AND state IS NOT NULL ORDER BY state`)).map((r) => r.state),
    counties: await all<{ county: string; state: string }>(
      `SELECT DISTINCT county, state FROM projects p WHERE ${w} AND county IS NOT NULL ORDER BY state, county`,
    ),
  };
}

export async function getProject(id: number) {
  const p = await get<PublicProject & {
    description: string | null; needs: string | null; requested_amount: number | null; budget_amount: number | null;
    acres: number | null; source_url: string | null; source_name: string | null; created_at: string; fips: string | null;
  }>(
    `SELECT p.id, p.name, p.stage, p.category, p.county, p.state, p.lat, p.lng, p.location_precision, o.name AS owner,
            p.verification, p.description, p.needs, p.requested_amount, p.budget_amount, p.acres, p.source_url, p.created_at, p.fips,
            s.name AS source_name
     FROM projects p LEFT JOIN organizations o ON o.id = p.owner_org_id LEFT JOIN sources s ON s.id = p.source_id
     WHERE p.id = ? AND ${publicRows('p')}`,
    id,
  );
  if (!p) return null;
  const awards = await all<{ id: number; program: string | null; amount_committed: number | null; amount_disbursed: number | null; year: number | null }>(
    `SELECT a.id, pr.name AS program, a.amount_committed, a.amount_disbursed, a.year
     FROM awards a LEFT JOIN programs pr ON pr.id = a.program_id
     WHERE a.project_id = ?${demoClause('a')} ORDER BY a.year DESC`,
    id,
  );
  const today = todayIso();
  const programs = (await all<{
    id: number; name: string; run_by: string | null; scope: string; state: string | null; counties: string | null;
    window_start: string | null; window_end: string | null; rolling: number; award_min: number | null; award_max: number | null;
    award_text: string | null; url: string | null; type: string;
  }>(`SELECT * FROM programs WHERE ${publicRows('')}`))
    .filter((pr) => programCoversCounty(pr, p.county, p.state) && windowStatus(pr, today) !== 'past')
    .sort((a, b) => order(windowStatus(a, today)) - order(windowStatus(b, today)))
    .slice(0, 6);
  return { project: p, awards, programs };
}
const order = (s: WindowStatus) => ({ open: 0, rolling: 1, upcoming: 2, past: 3 })[s];

// ---------- map ----------
export type Bbox = [west: number, south: number, east: number, north: number];

export async function mapGrid(f: ProjectFilters, bbox: Bbox | null, zoom: number): Promise<{ cell: number; features: GridFeature[] }> {
  const { where, params } = projectWhere(f);
  const geo = bbox ? ' AND p.lng BETWEEN ? AND ? AND p.lat BETWEEN ? AND ?' : '';
  const rows = await all<{ lat: number; lng: number }>(
    `SELECT p.lat, p.lng FROM projects p LEFT JOIN organizations o ON o.id = p.owner_org_id
     WHERE ${where} AND p.lat IS NOT NULL${geo}`,
    ...params, ...(bbox ? [bbox[0], bbox[2], bbox[1], bbox[3]] : []),
  );
  const cell = cellForZoom(zoom);
  return { cell, features: aggregateGrid(rows, cell) };
}

export async function mapPoints(f: ProjectFilters, bbox: Bbox, limit = 3000) {
  const { where, params } = projectWhere(f);
  return await all<{ id: number; name: string; stage: string; lat: number; lng: number; location_precision: string | null; county: string | null }>(
    `SELECT p.id, p.name, p.stage, p.lat, p.lng, p.location_precision, p.county
     FROM projects p LEFT JOIN organizations o ON o.id = p.owner_org_id
     WHERE ${where} AND p.lat IS NOT NULL AND p.lng BETWEEN ? AND ? AND p.lat BETWEEN ? AND ? LIMIT ?`,
    ...params, bbox[0], bbox[2], bbox[1], bbox[3], limit,
  );
}

export const ORG_LAYERS: Record<string, { label: string; types: string[] | null; recipientsOnly?: boolean }> = {
  recipients: { label: 'Funding recipients', types: null, recipientsOnly: true },
  communities: { label: 'Communities', types: ['firewise_community', 'hoa'] },
  agencies: { label: 'Agencies and districts', types: ['county', 'state_agency', 'federal_agency', 'fire_district'] },
  partners: { label: 'Partners and crews', types: ['nonprofit', 'foundation', 'university', 'workforce_corps', 'crew', 'investor'] },
};

export async function mapOrgs(layer: string, bbox: Bbox, limit = 3000) {
  const cfg = ORG_LAYERS[layer];
  if (!cfg) return [];
  const parts = [publicRows('o'), 'o.lat IS NOT NULL', 'o.lng BETWEEN ? AND ?', 'o.lat BETWEEN ? AND ?'];
  const params: Param[] = [bbox[0], bbox[2], bbox[1], bbox[3]];
  if (cfg.types) { parts.push(`o.type IN (${cfg.types.map(() => '?').join(',')})`); params.push(...cfg.types); }
  if (cfg.recipientsOnly) parts.push('EXISTS (SELECT 1 FROM awards a WHERE a.org_id = o.id)');
  return await all<{ id: number; name: string; type: string; lat: number; lng: number; county: string | null }>(
    `SELECT o.id, o.name, o.type, o.lat, o.lng, o.county FROM organizations o WHERE ${parts.join(' AND ')} LIMIT ?`,
    ...params, limit,
  );
}

export async function layerCounts() {
  const w = (a: string) => publicRows(a);
  const orgCount = async (layer: string) => {
    const cfg = ORG_LAYERS[layer];
    const parts = [w('o')];
    const params: Param[] = [];
    if (cfg.types) { parts.push(`o.type IN (${cfg.types.map(() => '?').join(',')})`); params.push(...cfg.types); }
    if (cfg.recipientsOnly) parts.push('EXISTS (SELECT 1 FROM awards a WHERE a.org_id = o.id)');
    return await scalar<number>(`SELECT COUNT(*) FROM organizations o WHERE ${parts.join(' AND ')}`, ...params);
  };
  return {
    projects: await scalar<number>(`SELECT COUNT(*) FROM projects p WHERE ${w('p')}`),
    recipients: await orgCount('recipients'),
    communities: await orgCount('communities'),
    agencies: await orgCount('agencies'),
    partners: await orgCount('partners'),
    counties: await scalar<number>(`SELECT COUNT(*) FROM counties`),
  };
}

// ---------- counties and the funding gap ----------
export type CountyStat = {
  fips: string; name: string; state: string; lat: number | null; lng: number | null;
  risk: number | null; awards: number; committed: number; requested: number; gap: boolean; firewise: number; fema: number; federal: number;
};

export async function countyStats(): Promise<{ counties: CountyStat[]; riskCutoff: number | null; gapCount: number }> {
  const rows = await all<{ fips: string; name: string; state: string; lat: number | null; lng: number | null; risk_score: number | null }>(
    `SELECT fips, name, state, lat, lng, risk_score FROM counties`,
  );
  const awards = new Map(
    (await all<{ fips: string; n: number; s: number }>(
      `SELECT fips, COUNT(*) n, COALESCE(SUM(amount_committed),0) s FROM awards a WHERE fips IS NOT NULL${demoClause('a')} GROUP BY fips`,
    )).map((r) => [r.fips, r]),
  );
  const requested = new Map(
    (await all<{ fips: string; s: number }>(
      `SELECT fips, COALESCE(SUM(requested_amount),0) s FROM projects p WHERE fips IS NOT NULL AND stage = 'seeking_funding' AND ${publicRows('p')} GROUP BY fips`,
    )).map((r) => [r.fips, r.s]),
  );
  const byAgency = async (like: string) => new Map(
    (await all<{ fips: string; s: number }>(
      `SELECT a.fips, COALESCE(SUM(a.amount_committed),0) s FROM awards a JOIN programs pr ON pr.id = a.program_id
       WHERE a.fips IS NOT NULL AND (${like})${demoClause('a')} GROUP BY a.fips`,
    )).map((r) => [r.fips, r.s]),
  );
  const femaSum = await byAgency("pr.run_by ILIKE 'Federal Emergency%'");
  const federalSum = await byAgency("pr.run_by ILIKE 'Federal%' OR pr.run_by ILIKE 'USDA%' OR pr.run_by ILIKE 'Natural Resources%'");
  const firewise = new Map(
    (await all<{ fips: string; n: number }>(
      `SELECT c.fips, COUNT(*) n FROM organizations o JOIN counties c ON lower(c.name) = lower(replace(o.county,' County','')) AND c.state = o.state
       WHERE o.type IN ('firewise_community','hoa') AND ${publicRows('o')} GROUP BY c.fips`,
    )).map((r) => [r.fips, r.n]),
  );
  const scores = rows.map((r) => r.risk_score).filter((n): n is number => n != null).sort((a, b) => a - b);
  const riskCutoff = scores.length ? scores[Math.floor(scores.length * 0.75)] : null;
  const counties = rows.map((r) => {
    const a = awards.get(r.fips);
    return {
      fips: r.fips, name: r.name, state: r.state, lat: r.lat, lng: r.lng, risk: r.risk_score,
      awards: a?.n ?? 0, committed: a?.s ?? 0, requested: requested.get(r.fips) ?? 0,
      gap: riskCutoff != null && r.risk_score != null && r.risk_score >= riskCutoff && !a,
      firewise: firewise.get(r.fips) ?? 0, fema: femaSum.get(r.fips) ?? 0, federal: federalSum.get(r.fips) ?? 0,
    };
  });
  return { counties, riskCutoff, gapCount: counties.filter((c) => c.gap).length };
}

// ---------- headline, home and data pages ----------
export async function headline() {
  const demo = demoClause('x');
  const orgs = await scalar<number>(`SELECT COUNT(*) FROM organizations x WHERE ${publicRows('x')}`);
  const projects = await scalar<number>(`SELECT COUNT(*) FROM projects x WHERE ${publicRows('x')}`);
  const awards = await scalar<number>(`SELECT COUNT(*) FROM awards x WHERE 1=1${demo}`);
  const programs = await scalar<number>(`SELECT COUNT(*) FROM programs x WHERE ${publicRows('x')}`);
  const sources = await scalar<number>(`SELECT COUNT(*) FROM sources x WHERE is_private = 0${demo}`);
  const counties = await scalar<number>(`SELECT COUNT(*) FROM counties`);
  const verified = await scalar<number>(
    `SELECT (SELECT COUNT(*) FROM organizations WHERE verification='verified' AND published=1 AND archived=0)
          + (SELECT COUNT(*) FROM projects WHERE verification='verified' AND published=1 AND archived=0)
          + (SELECT COUNT(*) FROM programs WHERE verification='verified' AND archived=0 AND published=1)
          + (SELECT COUNT(*) FROM awards WHERE verification='verified')`,
  );
  const projectCounties = await scalar<number>(`SELECT COUNT(DISTINCT county || state) FROM projects x WHERE ${publicRows('x')} AND county IS NOT NULL`);
  return { orgs, projects, awards, programs, sources, counties, verified, projectCounties };
}

export async function homeFacts() {
  const { riskCutoff, gapCount } = await countyStats();
  const waiting = await get<{ s: number | null; n: number }>(
    `SELECT SUM(requested_amount) s, COUNT(*) n FROM projects p
     WHERE p.stage = 'seeking_funding' AND p.source_id IN (SELECT id FROM sources WHERE slug = 'openfema-hma') AND ${publicRows('p')}`,
  );
  const inRecord = await headline();
  return { gapCount, riskCutoff, waitingTotal: waiting?.s ?? 0, waitingCount: waiting?.n ?? 0, projects: inRecord.projects, awards: inRecord.awards };
}

export async function story(): Promise<{ headline: string; sub: string; body: string; oregon?: { funded: number; applications: number }; items: { title: string; line: string; projectId?: number }[] } | null> {
  const raw = (await get<{ value: string }>(`SELECT value FROM settings WHERE key = 'home.story'`))?.value;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function dataCharts() {
  const orgTypes = await all<{ k: string; n: number }>(`SELECT type k, COUNT(*) n FROM organizations x WHERE ${publicRows('x')} GROUP BY type ORDER BY n DESC`);
  const stages = await all<{ k: string; n: number }>(`SELECT stage k, COUNT(*) n FROM projects x WHERE ${publicRows('x')} GROUP BY stage ORDER BY n DESC`);
  const programs = await all<{ id: number; name: string; rolling: number; window_start: string | null; window_end: string | null }>(
    `SELECT id, name, rolling, window_start, window_end FROM programs WHERE ${publicRows('')}`,
  );
  const today = todayIso();
  const windows: Record<WindowStatus, number> = { open: 0, rolling: 0, upcoming: 0, past: 0 };
  for (const p of programs) windows[windowStatus(p, today)]++;
  const funders = await all<{ name: string; recipients: number; awards: number; committed: number }>(
    `SELECT pr.name, COUNT(DISTINCT a.org_id) recipients, COUNT(*) awards, COALESCE(SUM(a.amount_committed),0) committed
     FROM awards a JOIN programs pr ON pr.id = a.program_id WHERE 1=1${demoClause('a')}
     GROUP BY pr.id ORDER BY awards DESC LIMIT 12`,
  );
  const requests = await scalar<number>(`SELECT COUNT(*) FROM requests`);
  const intros = await scalar<number>(`SELECT COUNT(*) FROM requests WHERE status = 'intro_made'`);
  return { orgTypes, stages, windows, funders, requests, intros };
}

// ---------- programs ----------
export type PublicProgram = {
  id: number; name: string; run_by: string | null; funded_by: string | null; type: string; focus: string | null;
  window_start: string | null; window_end: string | null; rolling: number; award_min: number | null; award_max: number | null;
  award_text: string | null; where_label: string | null; eligibility: string | null; url: string | null;
  verification: string; checked_at: string | null; scope: string; state: string | null; counties: string | null;
};

export async function listPrograms(): Promise<PublicProgram[]> {
  return await all<PublicProgram>(`SELECT * FROM programs WHERE ${publicRows('')} ORDER BY lower(name)`);
}

// ---------- sources ledger ----------
export async function sourcesLedger() {
  const feeds = async (table: string) =>
    new Map((await all<{ source_id: number; n: number }>(`SELECT source_id, COUNT(*) n FROM ${table} WHERE source_id IS NOT NULL GROUP BY source_id`)).map((r) => [r.source_id, r.n]));
  const orgs = await feeds('organizations'), projects = await feeds('projects'), programs = await feeds('programs'), awards = await feeds('awards');
  const runs = await all<{ source_id: number; status: string; finished_at: string | null; started_at: string; rows_new: number }>(
    `SELECT source_id, status, finished_at, started_at, rows_new FROM source_runs ORDER BY started_at DESC`,
  );
  const runsBy = new Map<number, typeof runs>();
  for (const r of runs) runsBy.set(r.source_id, [...(runsBy.get(r.source_id) ?? []), r]);
  const rows = await all<{ id: number; slug: string | null; name: string; url: string | null; kind: string; description: string | null; last_fetched_at: string | null; verification: string }>(
    `SELECT id, slug, name, url, kind, description, last_fetched_at, verification FROM sources WHERE is_private = 0${demoClause('sources')}
     ORDER BY (SELECT COUNT(*) FROM projects WHERE source_id = sources.id) + (SELECT COUNT(*) FROM awards WHERE source_id = sources.id) DESC, name`,
  );
  return rows.map((s) => ({
    ...s,
    feeds: { organizations: orgs.get(s.id) ?? 0, projects: projects.get(s.id) ?? 0, programs: programs.get(s.id) ?? 0, awards: awards.get(s.id) ?? 0 },
    runs: (runsBy.get(s.id) ?? []).slice(0, 8),
  }));
}
