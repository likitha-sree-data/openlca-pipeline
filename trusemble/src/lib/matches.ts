import { all, get, run, tx } from './db';
import { programCoversCounty, windowLabel, windowStatus } from './programs';
import { todayIso } from './format';
import { label, PROJECT_CATEGORIES } from './constants';

type P = {
  id: number; name: string; category: string; county: string | null; state: string | null;
  requested_amount: number | null; stage: string;
};
type Pr = {
  id: number; name: string; focus: string | null; scope: string; state: string | null; counties: string | null;
  window_start: string | null; window_end: string | null; rolling: number; award_min: number | null; award_max: number | null;
};

const CATEGORY_FOCUS: Record<string, string[]> = {
  wildfire_mitigation: ['hazard mitigation', 'risk reduction', 'fuels reduction', 'defensible space'],
  fuels_reduction: ['fuels reduction', 'risk reduction', 'forestry'],
  defensible_space: ['defensible space', 'fuels reduction', 'risk reduction'],
  community_planning: ['community planning', 'cwpp', 'capacity'],
  home_hardening: ['home hardening', 'hazard mitigation', 'defensible space'],
  forest_restoration: ['forest restoration', 'forestry', 'conservation'],
  capacity_equipment: ['capacity', 'equipment and technology', 'staffing'],
  workforce: ['workforce'],
};

export type Scored = { program_id: number; score: number; reason: string };

export function scoreMatch(p: P, pr: Pr, today: string): Scored | null {
  if (!programCoversCounty(pr, p.county, p.state)) return null;
  const status = windowStatus(pr, today);
  if (status === 'past') return null;

  let score = 0;
  const why: string[] = [];

  if (pr.scope === 'counties') { score += 4; why.push(`covers ${p.county ?? 'the project county'}`); }
  else if (pr.scope === 'state') { score += 3; why.push(`covers ${p.state ?? 'the state'}`); }
  else { score += 1; why.push('open nationally'); }

  if (status === 'open') { score += 3; why.push(`window open ${windowLabel(pr)}`); }
  else if (status === 'upcoming') { score += 2; why.push(`window ${windowLabel(pr).toLowerCase()}`); }
  else { score += 1; why.push('accepts applications any time'); }

  const tags = (pr.focus ?? '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
  const wanted = CATEGORY_FOCUS[p.category] ?? [];
  const overlap = tags.filter((t) => wanted.includes(t));
  if (overlap.length) { score += 3; why.push(`focus matches ${label(PROJECT_CATEGORIES, p.category).toLowerCase()} (${overlap.join(', ')})`); }
  else if (wanted.length) return null; // geography alone is not a reason to suggest a program

  if (p.requested_amount && pr.award_max) {
    if (p.requested_amount <= pr.award_max) { score += 1; why.push('request fits the award size'); }
    else if (p.requested_amount > pr.award_max * 3) { score -= 1; why.push('request is well above the usual award'); }
  }
  const sentence = why.join('; ') + '.';
  return { program_id: pr.id, score, reason: sentence[0].toUpperCase() + sentence.slice(1) };
}

export const MIN_SCORE = 6;
export const MAX_PER_PROJECT = 3;

/** Recompute suggestions. Decided rows (accepted/dismissed) are kept; stale suggestions are replaced. */
export async function generateMatches(now = todayIso()): Promise<{ added: number; kept: number }> {
  const projects = await all<P>(
    `SELECT id, name, category, county, state, requested_amount, stage FROM projects
     WHERE archived = 0 AND stage IN ('planning','seeking_funding')`,
  );
  const programs = await all<Pr>(`SELECT * FROM programs WHERE archived = 0`);
  let added = 0;
  await tx(async () => {
    await run(`DELETE FROM matches WHERE status = 'suggested'`);
    for (const p of projects) {
      const scored = programs
        .map((pr) => scoreMatch(p, pr, now))
        .filter((s): s is Scored => !!s && s.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_PER_PROJECT);
      for (const s of scored) {
        const r = await run(
          `INSERT INTO matches (project_id, program_id, score, reason) VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, program_id) DO NOTHING`,
          p.id, s.program_id, s.score, s.reason,
        );
        added += r.changes;
      }
    }
  });
  const kept = (await get<{ n: number }>(`SELECT COUNT(*) n FROM matches WHERE status != 'suggested'`))?.n ?? 0;
  return { added, kept };
}
