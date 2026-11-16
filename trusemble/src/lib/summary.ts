import { all, scalar } from './db';
import { needsYou } from './today';
import { todayIso } from './format';
import type { Alert } from './notify';
import { label, REQUEST_KINDS } from './constants';

/** The one email the team gets each week: what changed and what needs a person. */
export function weeklySummary(now = new Date()): Alert {
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const n = needsYou(todayIso());
  const newReqs = scalar<number>(`SELECT COUNT(*) FROM requests WHERE received_at >= ?`, week);
  const checked = scalar<number>(`SELECT COUNT(DISTINCT entity || entity_id) FROM record_reviews WHERE created_at >= ?`, week);
  const added = scalar<number>(`SELECT (SELECT COUNT(*) FROM projects WHERE created_at >= ? AND verification != 'demo') + (SELECT COUNT(*) FROM organizations WHERE created_at >= ? AND verification != 'demo')`, week, week);
  const intros = scalar<number>(`SELECT COUNT(*) FROM requests WHERE status = 'intro_made' AND status_changed_at >= ?`, week);
  const kinds = all<{ kind: string; c: number }>(`SELECT kind, COUNT(*) c FROM requests WHERE received_at >= ? GROUP BY kind`, week);
  const lines = [
    `New requests this week: ${newReqs}${kinds.length ? ` (${kinds.map((k) => `${k.c} ${label(REQUEST_KINDS, k.kind).toLowerCase()}`).join(', ')})` : ''}`,
    `Introductions made this week: ${intros}`,
    `Records added this week: ${added}. Records checked by a person: ${checked}`,
    '',
    'Needs a person:',
    `  ${n.overdue} follow-ups are overdue`,
    `  ${n.noNextStep} open requests have no next step`,
    `  ${n.toCheck} records are waiting to be checked`,
    `  ${n.problems} data problems to review`,
    ...(n.closing.length ? ['', 'Funding closing in the next 30 days:', ...n.closing.map((c) => `  ${c.name} (${c.days} days)`)] : []),
  ];
  return { title: 'TruSemble weekly summary', lines, path: '/ops' };
}
