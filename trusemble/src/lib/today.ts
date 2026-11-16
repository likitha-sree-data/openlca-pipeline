import { all, scalar } from './db';
import { checkTotal } from './check';
import { daysBetween, todayIso } from './format';

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

/** Everything that needs a person, in the order they should do it. */
export function needsYou(today = todayIso()) {
  const open = `status != 'closed' AND archived = 0`;
  const newFromWebsite = all<{ id: number; ref: string; from_name: string; kind: string; received_at: string }>(
    `SELECT id, ref, from_name, kind, received_at FROM requests WHERE ${open} AND status = 'new' AND origin = 'public_form' ORDER BY received_at DESC LIMIT 5`,
  );
  const newFromWebsiteTotal = scalar<number>(`SELECT COUNT(*) FROM requests WHERE ${open} AND status = 'new' AND origin = 'public_form'`);
  const overdue = scalar<number>(`SELECT COUNT(*) FROM requests WHERE ${open} AND next_action_date IS NOT NULL AND next_action_date < ?`, today);
  const dueSoon = scalar<number>(`SELECT COUNT(*) FROM requests WHERE ${open} AND next_action_date >= ? AND next_action_date <= ?`, today, addDays(today, 7));
  const noNextStep = scalar<number>(`SELECT COUNT(*) FROM requests WHERE ${open} AND next_action_date IS NULL`);
  const toCheck = checkTotal();
  const problems = scalar<number>(`SELECT COUNT(*) FROM issues WHERE status = 'open'`);
  const closing = all<{ id: number; name: string; window_end: string }>(
    `SELECT id, name, window_end FROM programs WHERE archived = 0 AND window_end >= ? AND window_end <= ? ORDER BY window_end LIMIT 5`, today, addDays(today, 30),
  ).map((p) => ({ ...p, days: daysBetween(today, p.window_end) }));
  const suggestions = scalar<number>(`SELECT COUNT(*) FROM matches WHERE status = 'suggested'`);
  return { newFromWebsite, newFromWebsiteTotal, overdue, dueSoon, noNextStep, toCheck, problems, closing, suggestions };
}

export function checkedShare(): { checked: number; total: number } {
  const t = (table: string, extra = '') => scalar<number>(`SELECT COUNT(*) FROM ${table} WHERE archived = 0 AND verification != 'demo'${extra}`);
  const total = t('organizations') + t('projects') + t('programs');
  const checked = t('organizations', " AND verification = 'verified'") + t('projects', " AND verification = 'verified'") + t('programs', " AND verification = 'verified'");
  return { checked, total };
}
