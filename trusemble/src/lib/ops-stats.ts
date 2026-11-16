import { all, scalar } from './db';
import { verificationSplit } from './crud';
import { daysBetween, todayIso } from './format';
import { REQUEST_STATUSES } from './constants';

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

export function overview(today = todayIso()) {
  const openWhere = `status != 'closed' AND archived = 0`;
  const in14 = addDays(today, 14);
  const in90 = addDays(today, 90);

  const unscheduled = all<{ id: number; ref: string; from_name: string; kind: string; status: string; received_at: string; owner: string | null; next_action_date: string | null }>(
    `SELECT r.id, r.ref, r.from_name, r.kind, r.status, r.received_at, u.initials owner, r.next_action_date
     FROM requests r LEFT JOIN users u ON u.id = r.owner_id
     WHERE r.status != 'closed' AND r.archived = 0 AND r.next_action_date IS NULL
     ORDER BY CASE r.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, r.ref LIMIT 6`,
  );
  const due = all<{ id: number; ref: string; from_name: string; kind: string; status: string; received_at: string; owner: string | null; next_action_date: string | null; next_action: string | null }>(
    `SELECT r.id, r.ref, r.from_name, r.kind, r.status, r.received_at, u.initials owner, r.next_action_date, r.next_action
     FROM requests r LEFT JOIN users u ON u.id = r.owner_id
     WHERE r.status != 'closed' AND r.archived = 0 AND r.next_action_date IS NOT NULL AND r.next_action_date <= ?
     ORDER BY r.next_action_date`,
    in14,
  );

  const statusCounts = new Map(all<{ status: string; n: number }>(`SELECT status, COUNT(*) n FROM requests WHERE archived = 0 GROUP BY status`).map((r) => [r.status, r.n]));

  const upcoming = all<{ id: number; name: string; run_by: string | null; type: string; award_min: number | null; award_max: number | null; award_text: string | null; window_end: string; verification: string }>(
    `SELECT id, name, run_by, type, award_min, award_max, award_text, window_end, verification FROM programs
     WHERE archived = 0 AND window_end >= ? AND window_end <= ? ORDER BY window_end`,
    today, in90,
  ).map((p) => ({ ...p, days: daysBetween(today, p.window_end) }));

  const agingWhere = `status = 'new' AND archived = 0 AND status_changed_at <= ?`;
  const agingCut = new Date(Date.parse(today + 'T00:00:00Z') - 7 * 86_400_000).toISOString();
  const aging = all<{ id: number; ref: string; from_name: string; status_changed_at: string }>(
    `SELECT id, ref, from_name, status_changed_at FROM requests WHERE ${agingWhere} ORDER BY status_changed_at LIMIT 6`, agingCut,
  ).map((r) => ({ ...r, days: daysBetween(r.status_changed_at, today + 'T00:00:00Z') }));

  const unchecked = (table: string, extra = '1=1') => ({
    unchecked: scalar<number>(`SELECT COUNT(*) FROM ${table} WHERE verification != 'verified' AND ${extra}`),
    total: scalar<number>(`SELECT COUNT(*) FROM ${table} WHERE ${extra}`),
  });
  const queue = {
    Organizations: unchecked('organizations', 'archived = 0'),
    Projects: unchecked('projects', 'archived = 0'),
    Requests: unchecked('requests', 'archived = 0'),
    Contacts: unchecked('contacts', 'archived = 0'),
    Funding: unchecked('programs', 'archived = 0'),
  };

  return {
    cards: {
      openRequests: verificationSplit('requests', openWhere),
      projects: verificationSplit('projects', 'archived = 0'),
      organizations: verificationSplit('organizations', 'archived = 0'),
      contacts: verificationSplit('contacts', 'archived = 0'),
      deadlines: verificationSplit('programs', `archived = 0 AND window_end >= ? AND window_end <= ?`, today, in90),
      issues: scalar<number>(`SELECT COUNT(*) FROM issues WHERE status = 'open'`),
    },
    followups: { noDate: verificationSplit('requests', `${openWhere} AND next_action_date IS NULL`), due, nextToPlan: unscheduled },
    byStatus: {
      rows: REQUEST_STATUSES.map(([k, label]) => ({ key: k, label, n: statusCounts.get(k) ?? 0 })),
      split: verificationSplit('requests', 'archived = 0'),
    },
    upcoming,
    aging: { split: verificationSplit('requests', `${agingWhere}`, agingCut), rows: aging },
    queue: { openIssues: scalar<number>(`SELECT COUNT(*) FROM issues WHERE status = 'open'`), uncheckedTotal: Object.values(queue).reduce((a, q) => a + q.unchecked, 0), rows: queue },
  };
}
