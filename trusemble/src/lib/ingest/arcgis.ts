import { tx } from '../db';
import { US_STATES } from '../constants';
import { pickField, type Ctx, type Fetcher } from './runner';
import { upsertOrganization, upsertProject } from './store';

type Feature = { type: 'Feature'; id?: number | string; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } | null };
type Page = { features?: Feature[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean }; error?: { message: string } };

/** Walk an ArcGIS REST layer with resultOffset paging. Works for FeatureServer and MapServer layers that support pagination. */
export async function* arcgisPages(ctx: Ctx, layerUrl: string, opts: { where?: string; outFields?: string; pageSize?: number; extra?: Record<string, string> } = {}): AsyncGenerator<Feature[]> {
  const size = opts.pageSize ?? 1000;
  let offset = 0;
  let total = 0;
  for (;;) {
    const q = new URLSearchParams({ where: opts.where ?? '1=1', outFields: opts.outFields ?? '*', outSR: '4326', f: 'geojson', returnGeometry: 'true', resultOffset: String(offset), resultRecordCount: String(size), ...(opts.extra ?? {}) });
    const page = await ctx.fetchJson<Page>(`${layerUrl.replace(/\/$/, '')}/query?${q}`);
    if (page.error) throw new Error(`ArcGIS error: ${page.error.message}`);
    const feats = page.features ?? [];
    if (feats.length === 0) return;
    yield feats;
    total += feats.length;
    offset += feats.length;
    if (ctx.limit && total >= ctx.limit) return;
    if (feats.length < size && !page.exceededTransferLimit && !page.properties?.exceededTransferLimit) return;
  }
}

/** Centre of a point or polygon (bounding box centre, good enough for "area centre" markers). */
export function centroid(g: Feature['geometry']): { lat: number; lng: number } | null {
  if (!g) return null;
  if (g.type === 'Point') { const [lng, lat] = g.coordinates as number[]; return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null; }
  const pts: number[][] = [];
  const walk = (c: unknown): void => { if (Array.isArray(c) && typeof c[0] === 'number') pts.push(c as number[]); else if (Array.isArray(c)) c.forEach(walk); };
  walk(g.coordinates);
  if (!pts.length) return null;
  const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

export const stateCode = (v: string | number | null): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  if (s.length === 2 && US_STATES[s.toUpperCase()]) return s.toUpperCase();
  return Object.entries(US_STATES).find(([, n]) => n.toLowerCase() === s.toLowerCase())?.[0] ?? null;
};
const num = (v: string | number | null) => (v === null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// ------------------------------------------------------------------ NFPA Firewise USA sites -> organizations
// Field names are matched from candidate lists; the first run logs which rows had no usable name so the lists can be extended.
const FIREWISE = {
  name: ['SITE_NAME', 'SiteName', 'Site_Name', 'Name', 'NAME', 'Community', 'COMMUNITY_NAME'],
  county: ['COUNTY', 'County', 'County_Name'], state: ['STATE', 'State', 'ST', 'STATE_ABBR'], city: ['CITY', 'City'],
};

export const nfpaFirewise: Fetcher = {
  id: 'nfpa-firewise', slug: 'nfpa-firewise', name: 'NFPA Firewise USA sites in good standing, 2024 release (ArcGIS Online)',
  url: 'https://services1.arcgis.com/0V03GIVRCAoxbtdR/ArcGIS/rest/services/Firewise_sites/FeatureServer/0', kind: 'public_record',
  description: 'Site names, county, city, point, resident count and total investment as published by NFPA. Every state.',
  async run(ctx) {
    for await (const feats of arcgisPages(ctx, this.url)) {
      tx(() => {
        for (const f of feats) {
          const name = pickField(f.properties, FIREWISE.name);
          if (!name) { ctx.skip('no site name found in the layer fields'); continue; }
          const c = centroid(f.geometry);
          const r = upsertOrganization(ctx.sourceId, String(f.id ?? f.properties.OBJECTID ?? name), {
            name: String(name), type: 'firewise_community', county: strOrNull(pickField(f.properties, FIREWISE.county)), state: stateCode(pickField(f.properties, FIREWISE.state)),
            city: strOrNull(pickField(f.properties, FIREWISE.city)), lat: c?.lat, lng: c?.lng, precision: 'community',
          });
          ctx.count(r.outcome);
        }
      });
      ctx.log(`${ctx.stats.new} new, ${ctx.stats.updated} updated so far`);
      if (ctx.limit && ctx.stats.new + ctx.stats.updated + ctx.stats.unchanged >= ctx.limit) return;
    }
  },
};

// ------------------------------------------------------------------ Oregon Department of Forestry fuels treatments -> projects
const ODF = {
  type: ['ACTIVITY_TYPE', 'ACTIVITY', 'TREATMENT', 'TREATMENT_TYPE', 'Activity'], unit: ['UNIT_NAME', 'UNIT', 'DISTRICT', 'Unit'], year: ['FISCAL_YEAR', 'YEAR', 'ACT_YEAR', 'Year'],
  status: ['STATUS', 'ACTIVITY_STATUS', 'Status'], acres: ['ACRES', 'Acres', 'GIS_ACRES'], county: ['COUNTY', 'County'],
};
const ODF_STAGE: Record<string, string> = { completed: 'complete', planned: 'planning', initiated: 'in_progress' };

export const odfFuels: Fetcher = {
  id: 'odf-fuels', slug: 'odf-fuels', name: 'Oregon Department of Forestry fuels treatments (ArcGIS layer ODF_FUELS_ACTIVITIES, updated March 2023)',
  url: 'https://services1.arcgis.com/CD5mKowwN6nIaqd8/arcgis/rest/services/ODF_FUELS_ACTIVITIES/FeatureServer/0', kind: 'public_record',
  description: 'Treatments with a recorded status only (Completed, Planned, Initiated); rows marked Unknown are left out. Names are built from treatment type, unit and year; landowner and staff names in the layer are never imported.',
  async run(ctx) {
    for await (const feats of arcgisPages(ctx, this.url)) {
      tx(() => {
        for (const f of feats) {
          const status = String(pickField(f.properties, ODF.status) ?? '').toLowerCase();
          const stage = ODF_STAGE[status];
          if (!stage) { ctx.skip('status is not Completed, Planned or Initiated'); continue; }
          const c = centroid(f.geometry);
          const type = pickField(f.properties, ODF.type) ?? 'Fuels treatment';
          const unit = pickField(f.properties, ODF.unit);
          const year = pickField(f.properties, ODF.year);
          const name = [type, unit, year].filter(Boolean).join(' · '); // never a landowner or staff name
          const r = upsertProject(ctx.sourceId, String(f.id ?? f.properties.OBJECTID ?? name), {
            name, stage, category: 'fuels_reduction', state: 'OR', county: strOrNull(pickField(f.properties, ODF.county)), lat: c?.lat, lng: c?.lng, precision: 'area_centre', acres: num(pickField(f.properties, ODF.acres)),
          });
          ctx.count(r.outcome);
        }
      });
      ctx.log(`${ctx.stats.new} new, ${ctx.stats.updated} updated so far`);
      if (ctx.limit && ctx.stats.new + ctx.stats.updated + ctx.stats.unchanged >= ctx.limit) return;
    }
  },
};

// ------------------------------------------------------------------ USFS FACTS hazardous fuels treatments -> projects (one per NEPA project)
const FACTS = {
  nepa: ['NEPA_DOC_NBR', 'NEPA_PROJECT_ID', 'NEPA_PROJECT_NAME', 'NEPA_DOC_NBR_'], name: ['NEPA_PROJECT_NAME', 'PROJECT_NAME', 'NEPA_DOC_NAME', 'ACTIVITY_NAME', 'NAME'],
  state: ['STATE_ABBR', 'STATE', 'STATE_NAME'], county: ['COUNTY_NAME', 'COUNTY'], acres: ['NBR_UNITS_ACCOMPLISHED', 'ACRES', 'GIS_ACRES', 'NBR_UNITS_PLANNED'], date: ['DATE_COMPLETED', 'ACTIVITY_END_DATE'],
};

export const fsFacts: Fetcher = {
  id: 'fs-facts', slug: 'fs-facts', name: 'US Forest Service hazardous fuels treatments by NEPA project (FACTS, Enterprise Data Warehouse)',
  url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_HazardousFuelsTreatments_01/MapServer/0', kind: 'public_record',
  description: 'US Government work, public domain. Treatments completed since fiscal year 2021, summed per NEPA project; acres count each treatment. Point = center of the treated area. No dollar amounts.',
  async run(ctx) {
    const groups = new Map<string, { name: string; state: string | null; county: string | null; acres: number; lat: number | null; lng: number | null; n: number }>();
    for await (const feats of arcgisPages(ctx, this.url, { where: "FY_COMPLETED >= 2021", pageSize: 1000 })) {
      for (const f of feats) {
        const id = pickField(f.properties, FACTS.nepa);
        const name = pickField(f.properties, FACTS.name);
        if (!id || !name) { ctx.skip('no NEPA project id or name found'); continue; }
        const c = centroid(f.geometry);
        const g = groups.get(String(id)) ?? { name: String(name), state: stateCode(pickField(f.properties, FACTS.state)), county: strOrNull(pickField(f.properties, FACTS.county)), acres: 0, lat: c?.lat ?? null, lng: c?.lng ?? null, n: 0 };
        g.acres += num(pickField(f.properties, FACTS.acres)) ?? 0;
        g.n++;
        groups.set(String(id), g);
      }
      ctx.log(`${groups.size} NEPA projects read`);
      if (ctx.limit && groups.size >= ctx.limit) break;
    }
    const entries = [...groups.entries()].slice(0, ctx.limit || undefined);
    for (let i = 0; i < entries.length; i += 500) {
      tx(() => {
        for (const [id, g] of entries.slice(i, i + 500)) {
          const r = upsertProject(ctx.sourceId, id, { name: g.name, stage: 'complete', category: 'fuels_reduction', state: g.state, county: g.county, lat: g.lat, lng: g.lng, precision: 'area_centre', acres: Math.round(g.acres * 10) / 10 });
          ctx.count(r.outcome);
        }
      });
    }
  },
};

const strOrNull = (v: string | number | null) => (v === null ? null : String(v));
