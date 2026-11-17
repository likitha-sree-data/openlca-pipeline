import { all, scalar } from './db';
import { checkTotal } from './check';
import { daysBetween, todayIso } from './format';

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

/** Everything that needs a person, in the order they should do it. */
export async function needsYou(today = todayIso()) {
  const open = `status != 'closed' AND archived = 0`;
  const newFromWebsite = await all<{ id: number; ref: string; from_name: string; kind: string; received_at: string }>(
    `SELECT id, ref, from_name, kind, received_at FROM requests WHERE ${open} AND status = 'new' AND origin = 'public_form' ORDER BY received_at DESC LIMIT 5`,
  );
  const newFromWebsiteTotal = await scalar<number>(`SELECT COUNT(*) FROM requests WHERE ${open} AND status = 'new' AND origin = 'public_form'`);
  const overdue = await scalar<number>(`SELECT COUNT(*) FROM requests WHERE ${open} AND next_action_date IS NOT NULL AND next_action_date < ?`, today);
  const dueSoon = await scalar<number>(`SELECT COUNT(*) FROM requests WHERE ${open} AND next_action_date >= ? AND next_action_date <= ?`, today, addDays(today, 7));
  const noNextStep = await scalar<number>(`SELECT COUNT(*) FROM requests WHERE ${open} AND next_action_date IS NULL`);
  const toCheck = await checkTotal();
  const problems = await scalar<number>(`SELECT COUNT(*) FROM issues WHERE status = 'open'`);
  const closing = (await all<{ id: number; name: string; window_end: string }>(
    `SELECT id, name, window_end FROM programs WHERE archived = 0 AND window_end >= ? AND window_end <= ? ORDER BY window_end LIMIT 5`, today, addDays(today, 30),
  )).map((p) => ({ ...p, days: daysBetween(today, p.window_end) }));
  const suggestions = await scalar<number>(`SELECT COUNT(*) FROM matches WHERE status = 'suggested'`);
  const readyToShow = await scalar<number>(`SELECT COUNT(*) FROM projects WHERE archived = 0 AND published = 0 AND verification != 'demo' AND county IS NOT NULL AND county != '' AND state IS NOT NULL AND length(description) >= 20`);
  const staleProgramPages = await scalar<number>(`SELECT COUNT(*) FROM programs WHERE archived = 0 AND published = 1 AND verification != 'demo' AND (checked_at IS NULL OR checked_at < ?)`, addDays(today, -90));
  return { readyToShow, staleProgramPages, newFromWebsite, newFromWebsiteTotal, overdue, dueSoon, noNextStep, toCheck, problems, closing, suggestions };
}

export async function checkedShare(): Promise<{ checked: number; total: number }> {
  const t = async (table: string, extra = '') => await scalar<number>(`SELECT COUNT(*) FROM ${table} WHERE archived = 0 AND verification != 'demo'${extra}`);
  const total = await t('organizations') + await t('projects') + await t('programs');
  const checked = await t('organizations', " AND verification = 'verified'") + await t('projects', " AND verification = 'verified'") + await t('programs', " AND verification = 'verified'");
  return { checked, total };
}
