import { all, get, scalar } from './db';
import { fmtDate, fmtMoney, fmtRange } from './format';
import { label, ORG_TYPES, PRECISIONS, PROGRAM_TYPES, PROJECT_CATEGORIES, PROJECT_STAGES } from './constants';
import { whereLabel } from './crud';
import { windowLabel } from './programs';

export type CheckSlug = 'funding' | 'projects' | 'organizations';
export type CheckItem = { slug: CheckSlug; id: number; name: string; source: string | null; published: number };

/**
 * Everything a person still needs to compare with its source, most useful first:
 * funding programs (few, high value), then projects, then organizations; public rows and rows with a source first.
 * Sample rows are never in the queue.
 */
export function checkQueue(limit = 500): CheckItem[] {
  return all<CheckItem>(
    `SELECT * FROM (
       SELECT 'funding' slug, pr.id, pr.name, s.name source, pr.published, 0 kind FROM programs pr LEFT JOIN sources s ON s.id = pr.source_id WHERE pr.verification = 'unverified' AND pr.archived = 0
       UNION ALL SELECT 'projects', p.id, p.name, s.name, p.published, 1 FROM projects p LEFT JOIN sources s ON s.id = p.source_id WHERE p.verification = 'unverified' AND p.archived = 0
       UNION ALL SELECT 'organizations', o.id, o.name, s.name, o.published, 2 FROM organizations o LEFT JOIN sources s ON s.id = o.source_id WHERE o.verification = 'unverified' AND o.archived = 0
     ) ORDER BY kind, published DESC, source IS NULL, id LIMIT ?`,
    limit,
  );
}

export function checkTotal(): number {
  return scalar<number>(
    `SELECT (SELECT COUNT(*) FROM programs WHERE verification = 'unverified' AND archived = 0)
          + (SELECT COUNT(*) FROM projects WHERE verification = 'unverified' AND archived = 0)
          + (SELECT COUNT(*) FROM organizations WHERE verification = 'unverified' AND archived = 0)`,
  );
}

export function checkedByUserToday(userId: number, now = new Date()): number {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  return scalar<number>('SELECT COUNT(DISTINCT entity || entity_id) FROM record_reviews WHERE user_id = ? AND created_at >= ?', userId, start);
}

export type CheckDetail = {
  name: string;
  fields: [string, string][];
  source: { name: string; url: string | null; description: string | null } | null;
  sourceRef: string | null;
  link: string | null;
};

type Row = Record<string, string | number | null>;
const put = (out: [string, string][], k: string, v: string | number | null | undefined) => { if (v !== null && v !== undefined && String(v).trim() !== '') out.push([k, String(v)]); };

/** The record in plain words, next to what it says it came from. */
export function checkDetail(slug: CheckSlug, id: number): CheckDetail | null {
  const table = slug === 'funding' ? 'programs' : slug;
  const r = get<Row>(`SELECT * FROM ${table} WHERE id = ?`, id);
  if (!r) return null;
  const f: [string, string][] = [];
  if (slug === 'projects') {
    put(f, 'What it is', label(PROJECT_CATEGORIES, String(r.category)));
    put(f, 'Where it stands', label(PROJECT_STAGES, String(r.stage)));
    put(f, 'Place', [r.county, r.state].filter(Boolean).join(', '));
    put(f, 'How exact the location is', r.location_precision ? label(PRECISIONS, String(r.location_precision)) : null);
    put(f, 'Needs', r.needs);
    put(f, 'Money asked for', r.requested_amount ? fmtMoney(Number(r.requested_amount)) : null);
    put(f, 'Budget', r.budget_amount ? fmtMoney(Number(r.budget_amount)) : null);
    put(f, 'Acres', r.acres);
    put(f, 'Description', r.description);
  } else if (slug === 'organizations') {
    put(f, 'Kind of group', label(ORG_TYPES, String(r.type)));
    put(f, 'Website', r.website);
    put(f, 'Place', [r.city, r.county, r.state].filter(Boolean).join(', '));
  } else {
    put(f, 'Run by', r.run_by);
    put(f, 'Paid for by', r.funded_by);
    put(f, 'Kind', label(PROGRAM_TYPES, String(r.type)));
    put(f, 'Pays for', r.focus);
    put(f, 'When you can apply', windowLabel({ window_start: r.window_start as string | null, window_end: r.window_end as string | null }));
    put(f, 'How much', fmtRange(r.award_min as number | null, r.award_max as number | null, r.award_text as string | null));
    put(f, 'Where', whereLabel(String(r.scope), r.state as string | null, r.counties as string | null));
    put(f, 'Who can apply', r.eligibility);
    put(f, 'Last looked at', r.checked_at ? fmtDate(String(r.checked_at)) : null);
  }
  const source = r.source_id ? get<{ name: string; url: string | null; description: string | null }>('SELECT name, url, description FROM sources WHERE id = ?', Number(r.source_id)) ?? null : null;
  const link = (slug === 'projects' ? (r.source_url as string | null) : slug === 'funding' ? (r.url as string | null) : (r.website as string | null)) ?? source?.url ?? null;
  return { name: String(r.name), fields: f, source, sourceRef: (r.source_ref as string | null) ?? null, link };
}
