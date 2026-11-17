import { get, run, tx } from './db';
import { logActivity } from './crud';
import { daysBetween, todayIso } from './format';
import { safeHref } from './safe-url';

export type Check = { key: string; label: string; ok: boolean; required: boolean; fix: string };
export type Readiness = { checks: Check[]; canPublish: boolean; missingRequired: Check[]; missingNice: Check[] };
type Row = Record<string, unknown>;

const text = (v: unknown, min = 1) => typeof v === 'string' && v.trim().length >= min;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function build(checks: Check[]): Readiness {
  const missingRequired = checks.filter((c) => c.required && !c.ok);
  return { checks, canPublish: missingRequired.length === 0, missingRequired, missingNice: checks.filter((c) => !c.required && !c.ok) };
}

/** What a project needs before the public can see it. Required items block publishing; the rest are advice. */
export function projectReadiness(r: Row): Readiness {
  return build([
    { key: 'place', label: 'Has a county and a state', ok: text(r.county) && text(r.state), required: true, fix: 'Add the county and state.' },
    { key: 'description', label: 'Says what the work is (a sentence or two)', ok: text(r.description, 20), required: true, fix: 'Write what the work is, how big it is, and who it protects.' },
    { key: 'map', label: 'Has a spot on the map', ok: num(r.lat) && num(r.lng), required: false, fix: 'Add a latitude and longitude, or it will be listed but not shown on the map.' },
    { key: 'source', label: 'Says where the information came from', ok: !!r.source_id || text(r.source_url), required: false, fix: 'Add a link to the plan or public record.' },
    { key: 'checked', label: 'A person has checked it against its source', ok: r.verification === 'verified', required: false, fix: 'Open "Check data" and compare it with the source.' },
  ]);
}

/** What a funding program needs before the public can see it. */
export function programReadiness(r: Row, today = todayIso()): Readiness {
  const looked = typeof r.checked_at === 'string' && r.checked_at ? daysBetween(r.checked_at, today) <= 90 : false;
  return build([
    { key: 'who', label: 'Says who runs it', ok: text(r.run_by), required: true, fix: 'Add who runs the program.' },
    { key: 'link', label: 'Links to the program page', ok: !!safeHref(r.url as string | null), required: true, fix: 'Add the link to the official program page (it must start with https://).' },
    { key: 'eligibility', label: 'Says who can apply', ok: text(r.eligibility, 20), required: true, fix: 'Copy the eligibility wording from the program page.' },
    { key: 'amount', label: 'Says how much it pays', ok: num(r.award_min) || num(r.award_max) || text(r.award_text), required: false, fix: 'Add the award size, or leave it as "Not stated" if the program does not say.' },
    { key: 'fresh', label: 'Someone looked at the program page in the last 90 days', ok: looked, required: false, fix: 'Open the program page and press "I looked at the program page today".' },
    { key: 'checked', label: 'A person has checked it against the program page', ok: r.verification === 'verified', required: false, fix: 'Open "Check data" and compare it with the program page.' },
  ]);
}

type Table = 'projects' | 'programs' | 'organizations';

/** What a group needs before it appears as a marker on the public map. */
export function organizationReadiness(r: Row): Readiness {
  return build([
    { key: 'place', label: 'Has a county and a state', ok: text(r.county) && text(r.state), required: true, fix: 'Add the county and state.' },
    { key: 'kind', label: 'Says what kind of group it is', ok: !!r.type && r.type !== 'other', required: false, fix: 'Choose a kind (for example Firewise community or Foundation).' },
    { key: 'map', label: 'Has a spot on the map', ok: num(r.lat) && num(r.lng), required: false, fix: 'Add a latitude and longitude, or it will not appear on the map.' },
    { key: 'website', label: 'Has a website', ok: !!safeHref(r.website as string | null), required: false, fix: 'Add the group\'s website (https://...).' },
    { key: 'checked', label: 'A person has checked it against its source', ok: r.verification === 'verified', required: false, fix: 'Open "Check data" and compare it with the source.' },
  ]);
}

export function readinessOf(table: Table, row: Row, today = todayIso()): Readiness {
  return table === 'projects' ? projectReadiness(row) : table === 'organizations' ? organizationReadiness(row) : programReadiness(row, today);
}

/** Show a record on the website, or hide it. Showing is refused until the required items are in place. */
export function setPublished(table: Table, id: number, show: boolean, userId: number, today = todayIso()): { ok: true } | { ok: false; error: string } {
  const row = get<Row>(`SELECT * FROM ${table} WHERE id = ?`, id);
  if (!row) return { ok: false, error: 'That record no longer exists.' };
  if (show) {
    const r = readinessOf(table, row, today);
    if (!r.canPublish) return { ok: false, error: `Not ready to show yet. ${r.missingRequired.map((c) => c.fix).join(' ')}` };
    if (row.archived) return { ok: false, error: 'This record is archived. Restore it first.' };
  }
  tx(() => {
    run(`UPDATE ${table} SET published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, show ? 1 : 0, id);
    logActivity(table, id, userId, 'edit', show ? 'Shown on the website' : 'Hidden from the website');
  });
  return { ok: true };
}

/** Someone re-read the program page. Resets the "last looked at" clock. */
export function markLooked(programId: number, userId: number, today = todayIso()): boolean {
  if (!get('SELECT 1 FROM programs WHERE id = ?', programId)) return false;
  run(`UPDATE programs SET checked_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, today, programId);
  logActivity('programs', programId, userId, 'edit', 'Looked at the program page again');
  return true;
}

export function lookedNote(checkedAt: string | null | undefined, today = todayIso()): { text: string; stale: boolean } {
  if (!checkedAt) return { text: 'Nobody has recorded looking at the program page yet', stale: true };
  const d = daysBetween(checkedAt, today);
  return { text: d <= 0 ? 'Looked at the program page today' : `Looked at the program page ${d} day${d === 1 ? '' : 's'} ago`, stale: d > 90 };
}
