import fs from 'node:fs';
import path from 'node:path';
import { run, tx } from '../db';
import { arcgisPages, centroid } from './arcgis';
import { pickField, type Fetcher } from './runner';
import { stateFromFips } from './federal';

// ------------------------------------------------------------------ Census TIGERweb county outlines -> counties table + data/counties.geojson
export const tigerCounties: Fetcher = {
  id: 'tiger-counties', slug: 'tiger-counties', name: 'US Census Bureau TIGERweb counties (State_County layer 1)',
  url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1', kind: 'public_record',
  description: 'US Government work, public domain. Every county in the 50 states, DC and Puerto Rico, outlines generalised to about 200 m.',
  async run(ctx) {
    const features: unknown[] = [];
    for await (const feats of arcgisPages(ctx, this.url, { outFields: 'GEOID,NAME,BASENAME,STATE,CENTLAT,CENTLON', pageSize: 500, extra: { maxAllowableOffset: '0.02', geometryPrecision: '3' } })) {
      tx(() => {
        for (const f of feats) {
          const fips = pickField(f.properties, ['GEOID']);
          const name = pickField(f.properties, ['BASENAME', 'NAME']);
          if (!fips || !name) { ctx.skip('no GEOID or name'); continue; }
          const st = stateFromFips(String(fips));
          if (!st) { ctx.skip('state outside the 50 states, DC and PR'); continue; }
          const c = centroid(f.geometry);
          const lat = Number(pickField(f.properties, ['CENTLAT'])) || c?.lat || null;
          const lng = Number(pickField(f.properties, ['CENTLON'])) || c?.lng || null;
          const existed = run(`UPDATE counties SET name = ?, state = ?, lat = ?, lng = ?, verification = 'unverified', source_id = ? WHERE fips = ?`, String(name), st, lat, lng, ctx.sourceId, String(fips)).changes;
          if (!existed) run(`INSERT INTO counties (fips, name, state, lat, lng, verification, source_id) VALUES (?, ?, ?, ?, ?, 'unverified', ?)`, String(fips), String(name), st, lat, lng, ctx.sourceId);
          ctx.count(existed ? 'updated' : 'new');
          features.push({ type: 'Feature', properties: { GEOID: String(fips), NAME: String(name) }, geometry: f.geometry });
        }
      });
      ctx.log(`${features.length} counties read`);
    }
    if (!ctx.limit) {
      const file = path.join(path.dirname(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'x.db')), 'counties.geojson');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features }));
      ctx.log(`wrote ${features.length} outlines to ${file}`);
    }
    run(`DELETE FROM counties WHERE verification = 'demo'`);
  },
};

// ------------------------------------------------------------------ FEMA National Risk Index: wildfire risk by county
export const femaNri: Fetcher = {
  id: 'fema-nri', slug: 'fema-nri', name: 'FEMA National Risk Index, wildfire risk by county',
  url: 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0', kind: 'public_record',
  description: 'US Government work, public domain. Modeled estimates: wildfire risk score (national percentile), rating and expected annual loss per county.',
  async run(ctx) {
    for await (const feats of arcgisPages(ctx, this.url, { outFields: 'STCOFIPS,COUNTY,STATEABBRV,WFIR_RISKS,WFIR_RISKR', extra: { returnGeometry: 'false' } })) {
      tx(() => {
        for (const f of feats) {
          const fips = pickField(f.properties, ['STCOFIPS']);
          const score = pickField(f.properties, ['WFIR_RISKS']);
          if (!fips || score === null) { ctx.skip('no county code or wildfire risk score (not rated)'); continue; }
          const changed = run(`UPDATE counties SET risk_score = ?, risk_rating = ? WHERE fips = ?`, Number(score), String(pickField(f.properties, ['WFIR_RISKR']) ?? ''), String(fips)).changes;
          if (!changed) { ctx.skip('county not in the counties table (run tiger-counties first)'); continue; }
          ctx.count('updated');
        }
      });
      ctx.log(`${ctx.stats.updated} counties scored`);
    }
  },
};
