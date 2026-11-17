import { all, get, scalar } from './db';

export type MetricDef = { key: string; label: string; target: number; market?: boolean };
export const LANES: Record<string, { title: string; metrics: MetricDef[] }> = {
  data: {
    title: 'Data',
    metrics: [
      { key: 'sources_pulled', label: 'Sources pulled', target: 5 },
      { key: 'new_records', label: 'New records', target: 30 },
      { key: 'workflow_demo', label: 'Workflow demo', target: 1 },
    ],
  },
  validation: {
    title: 'Validation',
    metrics: [
      { key: 'records_reviewed', label: 'Records reviewed', target: 10 },
      { key: 'briefs', label: 'Briefs', target: 3 },
      { key: 'validation_asks', label: 'Validation asks', target: 5 },
      { key: 'confirmed', label: 'Confirmed', target: 2, market: true },
    ],
  },
  outreach: {
    title: 'Outreach',
    metrics: [
      { key: 'qualified', label: 'Qualified people', target: 30 },
      { key: 'contacted', label: 'Contacted', target: 30 },
      { key: 'replies', label: 'Real replies', target: 3, market: true },
      { key: 'meetings', label: 'Meetings', target: 2, market: true },
    ],
  },
};

export type MetricStatus = 'Met' | 'In progress' | 'Not started' | 'Below target' | 'Awaiting acceptance';
export type MetricView = { key: string; label: string; value: number; target: number; status: MetricStatus; toGo: string };

export type Pilot = { name: string; start_date: string; deadline: string; checkpoint: string | null; review_title: string | null; review_notes: string | null };

export async function getPilot(): Promise<Pilot | undefined> {
  return await get<Pilot>('SELECT * FROM pilot WHERE id = 1');
}

async function metricValue(key: string, userId: number, since: string): Promise<number> {
  switch (key) {
    case 'sources_pulled': return await scalar(`SELECT COUNT(*) FROM sources WHERE last_fetched_at >= ? AND is_private = 0`, since);
    case 'new_records':
      return await scalar(
        `SELECT (SELECT COUNT(*) FROM organizations WHERE created_at >= ? AND verification != 'demo') + (SELECT COUNT(*) FROM projects WHERE created_at >= ? AND verification != 'demo')
              + (SELECT COUNT(*) FROM programs WHERE created_at >= ? AND verification != 'demo') + (SELECT COUNT(*) FROM awards WHERE created_at >= ? AND verification != 'demo')`,
        since, since, since, since,
      );
    case 'workflow_demo': return await scalar(`SELECT COUNT(*) FROM workflow_demos WHERE user_id = ? AND created_at >= ?`, userId, since);
    case 'records_reviewed': return await scalar(`SELECT COUNT(DISTINCT entity || ':' || entity_id) FROM record_reviews WHERE user_id = ? AND created_at >= ?`, userId, since);
    case 'briefs': return await scalar(`SELECT COUNT(*) FROM briefs WHERE author_id = ? AND created_at >= ? AND evidence IS NOT NULL AND gaps IS NOT NULL AND next_step IS NOT NULL AND next_owner_id IS NOT NULL`, userId, since);
    case 'validation_asks': return await scalar(`SELECT COUNT(*) FROM validation_asks WHERE user_id = ? AND asked_at >= ?`, userId, since);
    case 'confirmed': return await scalar(`SELECT COUNT(*) FROM validation_asks WHERE user_id = ? AND confirmed_at IS NOT NULL AND confirmed_at >= ?`, userId, since);
    case 'qualified': return await scalar(`SELECT COUNT(*) FROM pilot_people WHERE qualified_at IS NOT NULL AND added_by = ?`, userId);
    case 'contacted': return await scalar(`SELECT COUNT(*) FROM pilot_people WHERE contacted_at IS NOT NULL AND added_by = ?`, userId);
    case 'replies': return await scalar(`SELECT COUNT(*) FROM pilot_people WHERE replied_at IS NOT NULL AND added_by = ?`, userId);
    case 'meetings': return await scalar(`SELECT COUNT(*) FROM pilot_people WHERE meeting_at IS NOT NULL AND added_by = ?`, userId);
    default: return 0;
  }
}

export function statusFor(m: MetricDef, value: number, memberStatus: string, ended: boolean): MetricStatus {
  if (memberStatus === 'proposed') return 'Awaiting acceptance';
  if (value >= m.target) return 'Met';
  if (value === 0) return m.market || ended ? 'Below target' : 'Not started';
  return ended ? 'Below target' : 'In progress';
}

export async function scorecard(now = new Date()) {
  const pilot = await getPilot();
  if (!pilot) return null;
  const members = await all<{ user_id: number; name: string; lane: string; focus: string; status: string; capacity_hours: number | null; targets: string; initials: string; email: string }>(
    `SELECT m.*, u.name, u.initials, u.email FROM pilot_members m JOIN users u ON u.id = m.user_id ORDER BY m.user_id`,
  );
  const ended = now.getTime() > Date.parse(pilot.deadline);
  const msLeft = Date.parse(pilot.deadline) - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  const daysSinceEnd = ended ? Math.floor(-msLeft / 86_400_000) : 0;

  const cards = await Promise.all(members.map(async (m) => {
    const lane = LANES[m.lane] ?? { title: m.lane, metrics: [] };
    const overrides = safeJson<Record<string, number>>(m.targets) ?? {};
    const metrics: MetricView[] = await Promise.all(lane.metrics.map(async (def) => {
      const target = overrides[def.key] ?? def.target;
      const value = await metricValue(def.key, m.user_id, pilot.start_date);
      const d = { ...def, target };
      return {
        key: def.key, label: def.label, value, target,
        status: statusFor(d, value, m.status, ended),
        toGo: def.market ? 'market response' : `${Math.max(0, target - value)} to go`,
      };
    }));
    return { ...m, laneTitle: lane.title, metrics, notes: await laneNotes(m.lane, m.user_id, pilot, metrics) };
  }));

  const lastActivity = (await get<{ t: string | null }>(
    `SELECT MAX(t) t FROM (
       SELECT MAX(created_at) t FROM record_reviews UNION ALL SELECT MAX(created_at) FROM briefs
       UNION ALL SELECT MAX(asked_at) FROM validation_asks UNION ALL SELECT MAX(created_at) FROM workflow_demos
       UNION ALL SELECT MAX(created_at) FROM pilot_people UNION ALL SELECT MAX(created_at) FROM imports) AS x`,
  ))?.t ?? null;

  return { pilot, cards, ended, daysLeft, daysSinceEnd, lastActivity };
}

async function laneNotes(lane: string, userId: number, pilot: Pilot, metrics: MetricView[]): Promise<string | null> {
  if (lane === 'data') {
    const pulled = await all<{ id: number }>(`SELECT id FROM sources WHERE last_fetched_at >= ? AND is_private = 0`, pilot.start_date);
    let usable = 0;
    for (const s of pulled) {
      const fed = await scalar<number>(
        `SELECT (SELECT COUNT(*) FROM organizations WHERE source_id = ?1) + (SELECT COUNT(*) FROM projects WHERE source_id = ?1)
              + (SELECT COUNT(*) FROM programs WHERE source_id = ?1) + (SELECT COUNT(*) FROM awards WHERE source_id = ?1)`,
        s.id,
      );
      if (fed > 0) usable++;
    }
    const rows = await scalar<number>(
      `SELECT (SELECT COUNT(*) FROM organizations WHERE created_at >= ?1 AND verification != 'demo') + (SELECT COUNT(*) FROM projects WHERE created_at >= ?1 AND verification != 'demo')`, pilot.start_date,
    );
    const withSource = await scalar<number>(
      `SELECT (SELECT COUNT(*) FROM organizations WHERE created_at >= ?1 AND source_id IS NOT NULL AND verification != 'demo') + (SELECT COUNT(*) FROM projects WHERE created_at >= ?1 AND source_id IS NOT NULL AND verification != 'demo')`, pilot.start_date,
    );
    const pct = rows ? Math.round((withSource / rows) * 100) : 0;
    return `${usable} of ${pulled.length} sources with usable records · ${pct}% of 100% provenance complete`;
  }
  if (lane === 'outreach') {
    const contacted = metrics.find((m) => m.key === 'contacted')?.value ?? 0;
    const waiting = await scalar<number>(`SELECT COUNT(*) FROM pilot_people WHERE added_by = ? AND contacted_at IS NOT NULL AND replied_at IS NULL`, userId);
    const followed = await scalar<number>(`SELECT COUNT(*) FROM pilot_people WHERE added_by = ? AND contacted_at IS NOT NULL AND replied_at IS NULL AND followup_at IS NOT NULL`, userId);
    const cov = waiting ? `${Math.round((followed / waiting) * 100)}%` : 'N/A';
    return `${contacted} of 25 by the checkpoint · ${cov} of 100% follow-up coverage`;
  }
  return null;
}

const safeJson = <T,>(s: string): T | null => { try { return JSON.parse(s) as T; } catch { return null; } };

export async function dataTiles(since: string) {
  const sourcesTotal = await scalar<number>(`SELECT COUNT(*) FROM sources WHERE is_private = 0`);
  const fetched = await scalar<number>(`SELECT COUNT(*) FROM sources WHERE is_private = 0 AND last_fetched_at >= ?`, since);
  const c = async (t: string) => await scalar<number>(`SELECT COUNT(*) FROM ${t} WHERE created_at >= ? AND verification != 'demo'`, since);
  const orgs = await c('organizations'), projects = await c('projects'), awards = await c('awards'), programs = await c('programs');
  return {
    fetched, sourcesTotal, newRecords: orgs + projects + awards + programs, orgs, projects, awards, programs,
    orgsWithSource: await scalar<number>(`SELECT COUNT(*) FROM organizations WHERE source_id IS NOT NULL AND archived = 0`),
    projectsWithSource: await scalar<number>(`SELECT COUNT(*) FROM projects WHERE source_id IS NOT NULL AND archived = 0`),
    awardsTotal: await scalar<number>(`SELECT COUNT(*) FROM awards`),
  };
}

export async function sourcesTable(since: string) {
  return await all<{ id: number; name: string; url: string | null; last_fetched_at: string; organizations: number; projects: number; programs: number; awards: number }>(
    `SELECT s.id, s.name, s.url, s.last_fetched_at,
       (SELECT COUNT(*) FROM organizations WHERE source_id = s.id) organizations,
       (SELECT COUNT(*) FROM projects WHERE source_id = s.id) projects,
       (SELECT COUNT(*) FROM programs WHERE source_id = s.id) programs,
       (SELECT COUNT(*) FROM awards WHERE source_id = s.id) awards
     FROM sources s WHERE s.is_private = 0 AND s.last_fetched_at >= ? ORDER BY s.last_fetched_at DESC, 6 DESC`,
    since,
  );
}
