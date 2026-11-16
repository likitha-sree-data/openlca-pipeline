import { tx } from '../db';
import { pickField, type Fetcher } from './runner';
import { upsertAward, upsertOrganization, upsertProgram, upsertProject } from './store';
import { stateCode } from './arcgis';

const CFDA = ['10.720', '97.047', '97.039', '10.912', '10.664'];

// ------------------------------------------------------------------ USAspending: federal wildfire and forestry grants -> organizations + awards
type SpendRow = Record<string, unknown>;
type SpendPage = { results?: SpendRow[]; page_metadata?: { hasNext?: boolean; page?: number } };

export const usaSpending: Fetcher = {
  id: 'usaspending', slug: 'usaspending', name: 'USAspending.gov federal wildfire and forestry grants, every state (CWDG, BRIC, HMGP, EQIP, Cooperative Forestry)',
  url: 'https://api.usaspending.gov/api/v2/search/spending_by_award/', kind: 'public_record',
  description: 'Federal obligations since 2021 under CFDA 10.720, 97.047, 97.039, 10.912, 10.664. Amounts are obligations, not spend. Recipients are organizations; no people.',
  async run(ctx) {
    for (let page = 1; ; page++) {
      const body = {
        filters: { award_type_codes: ['02', '03', '04', '05'], program_numbers: CFDA, time_period: [{ start_date: '2021-10-01', end_date: new Date().toISOString().slice(0, 10) }] },
        fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Total Outlays', 'Description', 'Start Date', 'CFDA Number', 'Primary Place of Performance', 'generated_internal_id'],
        sort: 'Award Amount', order: 'desc', limit: 100, page,
      };
      const res = await ctx.fetchJson<SpendPage>(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const rows = res.results ?? [];
      tx(() => {
        for (const r of rows) {
          const name = r['Recipient Name'] as string | undefined;
          const awardId = (r['generated_internal_id'] ?? r['Award ID']) as string | undefined;
          if (!name || !awardId) { ctx.skip('award has no recipient name or id'); continue; }
          const pop = (r['Primary Place of Performance'] ?? {}) as Record<string, unknown>;
          const state = stateCode((pop.state_code as string) ?? null);
          const county = (pop.county_name as string | undefined) ?? null;
          const stFips = fipsOf(state);
          const countyCode = pop.county_code ? String(pop.county_code).padStart(3, '0') : null;
          const fips = stFips && countyCode ? stFips + countyCode : null;
          const org = upsertOrganization(ctx.sourceId, `recipient:${name}`, { name: titleCase(name), type: 'other', state, county: county ? titleCase(county) : null, published: true });
          const a = upsertAward(ctx.sourceId, String(awardId), {
            programRef: r['CFDA Number'] ? String(r['CFDA Number']) : null, orgId: org.id, committed: numOrNull(r['Award Amount']), disbursed: numOrNull(r['Total Outlays']),
            year: r['Start Date'] ? Number(String(r['Start Date']).slice(0, 4)) : null, county: county ? titleCase(county) : null, state, fips,
          });
          ctx.count(a.outcome);
        }
      });
      ctx.log(`page ${page}: ${rows.length} awards`);
      if (!res.page_metadata?.hasNext || rows.length === 0) return;
      if (ctx.limit && ctx.stats.new + ctx.stats.updated + ctx.stats.unchanged >= ctx.limit) return;
      await new Promise((r) => setTimeout(r, 300)); // be polite to a shared public API
    }
  },
};

// ------------------------------------------------------------------ Grants.gov: posted and forecast opportunities -> funding programs
type GgHit = { id?: string | number; number?: string; title?: string; agency?: string; agencyCode?: string; openDate?: string; closeDate?: string; oppStatus?: string };
const KEYWORDS = ['wildfire', 'hazardous fuels', 'community wildfire', 'defensible space', 'prescribed fire', 'fire adapted', 'forest restoration'];

const mdy = (s?: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? ''); return m ? `${m[3]}-${m[1]}-${m[2]}` : s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

export const grantsGov: Fetcher = {
  id: 'grants-gov', slug: 'grants-gov', name: 'Grants.gov posted and forecast opportunities: wildfire, fuels, defensible space, prescribed fire, forest restoration',
  url: 'https://api.grants.gov/v1/api/search2', kind: 'public_record',
  description: 'Keyword searches: wildfire; hazardous fuels; community wildfire; defensible space; prescribed fire; fire adapted; forest restoration. Research-only calls filtered out by applicant type.',
  async run(ctx) {
    const seen = new Set<string>();
    for (const keyword of KEYWORDS) {
      const res = await ctx.fetchJson<{ data?: { oppHits?: GgHit[] } }>(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword, oppStatuses: 'forecasted|posted', rows: 100, startRecordNum: 0 }) });
      const hits = res.data?.oppHits ?? [];
      tx(() => {
        for (const h of hits) {
          const ref = String(h.number ?? h.id ?? '');
          if (!ref || !h.title || seen.has(ref)) continue;
          seen.add(ref);
          const r = upsertProgram(ctx.sourceId, ref, {
            name: h.title, runBy: h.agency ?? h.agencyCode ?? null, type: 'grant', focus: 'Hazard mitigation', start: mdy(h.openDate), end: mdy(h.closeDate), scope: 'national',
            url: h.id ? `https://www.grants.gov/search-results-detail/${h.id}` : null,
          });
          ctx.count(r.outcome);
        }
      });
      ctx.log(`"${keyword}": ${hits.length} opportunities`);
    }
  },
};

// ------------------------------------------------------------------ OpenFEMA Hazard Mitigation Assistance subapplications -> projects (+ organizations, awards)
const FEMA = {
  id: ['id', 'subapplicationId', 'subapplicationIdentifier', 'projectIdentifier'], title: ['projectTitle', 'title', 'subapplicationTitle', 'projectName', 'subapplicationName'], applicant: ['subapplicantName', 'subrecipient', 'applicantName', 'subapplicant'],
  state: ['state', 'stateAbbreviation'], county: ['county', 'projectCounties', 'countyName'], program: ['programArea', 'program'], status: ['status', 'subapplicationStatus'],
  federal: ['federalShareObligated', 'totalObligatedAmount', 'federalShareAmount'], requested: ['projectAmount', 'federalShareRequested', 'totalProjectCost'], fy: ['programFy', 'fiscalYear'], type: ['projectType', 'mitigationType'],
};

export const openFema: Fetcher = {
  id: 'openfema', slug: 'openfema-hma', name: 'OpenFEMA Hazard Mitigation Assistance subapplications, fire hazard (HMGP, HMGP Post Fire, BRIC, PDM)',
  url: 'https://www.fema.gov/api/open/v2/HmaSubapplications', kind: 'public_record',
  description: 'US Government work, public domain. Local projects inside state mitigation grants with obligated and paid amounts. Management costs, denied and withdrawn requests left out.',
  async run(ctx) {
    const top = 1000;
    for (let skip = 0; ; skip += top) {
      const q = new URLSearchParams({ $top: String(top), $skip: String(skip), $orderby: 'id', $filter: "contains(projectType,'ildfire') or contains(projectType,'uel') or contains(projectType,'efensible')" });
      const res = await ctx.fetchJson<Record<string, unknown>>(`${this.url}?${q}`);
      const rows = ((res.HmaSubapplications ?? res.hmaSubapplications ?? []) as Record<string, unknown>[]);
      tx(() => {
        for (const row of rows) {
          const id = pickField(row, FEMA.id);
          const title = pickField(row, FEMA.title);
          const status = String(pickField(row, FEMA.status) ?? '').toLowerCase();
          if (!id || !title) { ctx.skip('no id or title found in the row'); continue; }
          if (/withdrawn|void|denied|not selected/.test(status)) { ctx.skip('withdrawn, void or denied'); continue; }
          const state = stateCode(pickField(row, FEMA.state));
          const county = pickField(row, FEMA.county);
          const applicant = pickField(row, FEMA.applicant);
          const org = applicant ? upsertOrganization(ctx.sourceId, `applicant:${applicant}`, { name: String(applicant), type: 'other', state, published: true }) : null;
          const federal = Number(pickField(row, FEMA.federal) ?? 0) || null;
          const requested = Number(pickField(row, FEMA.requested) ?? 0) || null;
          const awarded = /award|obligat|approv|complete/.test(status) || !!federal;
          const p = upsertProject(ctx.sourceId, String(id), {
            name: String(title), ownerOrgId: org?.id ?? null, stage: awarded ? 'funded' : 'seeking_funding', category: 'wildfire_mitigation', state, county: county ? String(county) : null,
            requested: awarded ? null : requested, budget: federal ?? requested, needs: awarded ? null : 'Funding',
          });
          ctx.count(p.outcome);
          if (federal) {
            const prog = String(pickField(row, FEMA.program) ?? '');
            const ref = /BRIC/i.test(prog) ? '97.047' : /HMGP/i.test(prog) ? '97.039' : null;
            upsertAward(ctx.sourceId, `award:${id}`, { programRef: ref, orgId: org?.id ?? null, projectId: p.id, committed: federal, year: Number(pickField(row, FEMA.fy)) || null, state, county: county ? String(county) : null });
          }
        }
      });
      ctx.log(`rows ${skip}-${skip + rows.length}: ${ctx.stats.new} new so far`);
      if (rows.length < top) return;
      if (ctx.limit && ctx.stats.new + ctx.stats.updated + ctx.stats.unchanged >= ctx.limit) return;
    }
  },
};

const STATE_FIPS: Record<string, string> = { AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56', PR: '72' };
export const fipsOf = (st: string | null) => (st ? STATE_FIPS[st] ?? null : null);
export const stateFromFips = (f: string) => Object.entries(STATE_FIPS).find(([, v]) => v === f.slice(0, 2))?.[0] ?? null;
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Inc|Usa|Hoa)\b/g, (m) => m.toUpperCase()) : s);
