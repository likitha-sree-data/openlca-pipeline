import { get, run, tx, type Param } from '../db';
import { nameKey } from '../text';

export type Outcome = 'new' | 'updated' | 'unchanged';
type Vals = Record<string, string | number | null | undefined>;

/**
 * Insert or update one row keyed by (source_id, source_ref). Rows a person has verified are never changed by a fetch.
 * Fetched rows are always unverified; blank incoming values never erase existing data.
 */
export async function upsertBySource(table: 'organizations' | 'projects' | 'programs' | 'awards', sourceId: number, ref: string, vals: Vals, existingId?: number | null): Promise<{ id: number; outcome: Outcome }> {
  const row = existingId
    ? await get<Record<string, unknown> & { id: number }>(`SELECT * FROM ${table} WHERE id = ?`, existingId)
    : await get<Record<string, unknown> & { id: number }>(`SELECT * FROM ${table} WHERE source_id = ? AND source_ref = ?`, sourceId, ref);
  const clean: Vals = Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== undefined));
  if (!row) {
    const cols = Object.keys(clean);
    const { lastId } = await run(
      `INSERT INTO ${table} (${[...cols, 'source_id', 'source_ref', 'verification'].join(', ')}) VALUES (${[...cols, 'source_id', 'source_ref', 'verification'].map(() => '?').join(', ')})`,
      ...([...cols.map((c) => clean[c]), sourceId, ref, 'unverified'] as Param[]),
    );
    return { id: lastId, outcome: 'new' };
  }
  if (row.verification === 'verified') return { id: row.id, outcome: 'unchanged' };
  const changed = Object.keys(clean).filter((k) => clean[k] !== null && clean[k] !== '' && (row[k] ?? null) !== clean[k]);
  if (changed.length === 0) return { id: row.id, outcome: 'unchanged' };
  const stamp = table === 'awards' ? '' : `, updated_at = now_iso()`;
  await run(`UPDATE ${table} SET ${changed.map((c) => `${c} = ?`).join(', ')}${stamp} WHERE id = ?`, ...(changed.map((c) => clean[c]) as Param[]), row.id);
  return { id: row.id, outcome: 'updated' };
}

export type OrgIn = { name: string; type?: string; county?: string | null; state?: string | null; city?: string | null; website?: string | null; lat?: number | null; lng?: number | null; precision?: string | null; published?: boolean };

export async function upsertOrganization(sourceId: number, ref: string, o: OrgIn) {
  const key = nameKey(o.name);
  // Reuse an organization another source already created for the same name and state, so recipients are not duplicated across sources.
  const existing = await get<{ id: number }>(
    `SELECT id FROM organizations WHERE (source_id = ? AND source_ref = ?) OR (name_key = ? AND (state IS NOT DISTINCT FROM ?::text OR state IS NULL OR ?::text IS NULL)) ORDER BY (source_id = ?) DESC, id LIMIT 1`,
    sourceId, ref, key, o.state ?? null, o.state ?? null, sourceId,
  );
  return await upsertBySource('organizations', sourceId, ref, {
    name: o.name, name_key: key, type: o.type, county: o.county, state: o.state, city: o.city, website: o.website,
    lat: o.lat ?? null, lng: o.lng ?? null, location_precision: o.lat != null ? o.precision ?? 'community' : null, published: o.published === false ? 0 : 1,
  }, existing?.id);
}

export type ProjectIn = {
  name: string; ownerOrgId?: number | null; stage?: string; category?: string; description?: string | null; county?: string | null; state?: string | null; fips?: string | null;
  lat?: number | null; lng?: number | null; precision?: string | null; acres?: number | null; budget?: number | null; requested?: number | null; needs?: string | null; url?: string | null;
};

export async function upsertProject(sourceId: number, ref: string, p: ProjectIn) {
  return await upsertBySource('projects', sourceId, ref, {
    name: p.name, name_key: nameKey(p.name), owner_org_id: p.ownerOrgId ?? null, stage: p.stage ?? 'planning', category: p.category ?? 'wildfire_mitigation', description: p.description ?? null,
    county: p.county ?? null, state: p.state ?? null, fips: p.fips ?? null, lat: p.lat ?? null, lng: p.lng ?? null, location_precision: p.lat != null ? p.precision ?? 'area_centre' : null,
    acres: p.acres ?? null, budget_amount: p.budget ?? null, requested_amount: p.requested ?? null, needs: p.needs ?? null, source_url: p.url ?? null, published: 1,
  });
}

export type ProgramIn = { name: string; runBy?: string | null; type?: string; focus?: string | null; start?: string | null; end?: string | null; min?: number | null; max?: number | null; scope?: string; state?: string | null; eligibility?: string | null; url?: string | null };

export async function upsertProgram(sourceId: number, ref: string, p: ProgramIn) {
  const byRef = await get<{ id: number }>('SELECT id FROM programs WHERE source_ref = ? LIMIT 1', ref);
  return await upsertBySource('programs', sourceId, ref, {
    name: p.name, name_key: nameKey(p.name), run_by: p.runBy ?? null, type: p.type ?? 'grant', focus: p.focus ?? null, window_start: p.start ?? null, window_end: p.end ?? null,
    rolling: p.start || p.end ? 0 : 1, award_min: p.min ?? null, award_max: p.max ?? null, scope: p.scope ?? 'national', state: p.state ?? null, eligibility: p.eligibility ?? null, url: p.url ?? null,
    checked_at: new Date().toISOString().slice(0, 10), published: 1,
  }, byRef?.id);
}

export type AwardIn = { programRef?: string | null; orgId?: number | null; projectId?: number | null; committed?: number | null; disbursed?: number | null; year?: number | null; county?: string | null; state?: string | null; fips?: string | null };

export async function upsertAward(sourceId: number, ref: string, a: AwardIn) {
  const program = a.programRef ? await get<{ id: number }>('SELECT id FROM programs WHERE source_ref = ? ORDER BY id LIMIT 1', a.programRef) : undefined;
  return await upsertBySource('awards', sourceId, ref, {
    program_id: program?.id ?? null, org_id: a.orgId ?? null, project_id: a.projectId ?? null, amount_committed: a.committed ?? null, amount_disbursed: a.disbursed ?? null,
    year: a.year ?? null, county: a.county ?? null, state: a.state ?? null, fips: a.fips ?? null,
  });
}

export { tx };
