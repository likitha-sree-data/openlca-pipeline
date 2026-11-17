export type Quick = { label: string; sql: string; params: (string | number)[] };

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

/** One-click filters shown above each list. Plain labels, plain conditions. */
export function quickFilters(entity: string, today: string, userId: number): Record<string, Quick> {
  switch (entity) {
    case 'requests':
      return {
        mine: { label: 'Mine', sql: "r.owner_id = ? AND r.status != 'closed'", params: [userId] },
        nobody: { label: 'Nobody yet', sql: "r.owner_id IS NULL AND r.status != 'closed'", params: [] },
        overdue: { label: 'Overdue', sql: "r.next_action_date < ? AND r.status != 'closed'", params: [today] },
      };
    case 'projects':
      return {
        needs: { label: 'Need funding', sql: "p.stage = 'seeking_funding'", params: [] },
        ready: { label: 'Ready to show', sql: "p.published = 0 AND p.county IS NOT NULL AND p.county != '' AND p.state IS NOT NULL AND length(p.description) >= 20", params: [] },
        hidden: { label: 'Hidden', sql: 'p.published = 0', params: [] },
      };
    case 'programs':
      return {
        open: { label: 'Open now', sql: '((pr.window_start IS NOT NULL OR pr.window_end IS NOT NULL) AND (pr.window_start IS NULL OR pr.window_start <= ?) AND (pr.window_end IS NULL OR pr.window_end >= ?))', params: [today, today] },
        always: { label: 'Always open', sql: 'pr.window_start IS NULL AND pr.window_end IS NULL', params: [] },
        soon: { label: 'Closing soon', sql: 'pr.window_end >= ? AND pr.window_end <= ?', params: [today, addDays(today, 30)] },
        past: { label: 'Closed', sql: 'pr.window_end < ?', params: [today] },
        hidden: { label: 'Hidden', sql: 'pr.published = 0', params: [] },
      };
    case 'organizations':
      return {
        funders: { label: 'Funders', sql: "o.type IN ('foundation','investor','federal_agency','state_agency')", params: [] },
        communities: { label: 'Communities', sql: "o.type IN ('firewise_community','hoa')", params: [] },
        nowebsite: { label: 'No website', sql: "(o.website IS NULL OR o.website = '')", params: [] },
        unsorted: { label: 'Kind not set', sql: "o.type = 'other'", params: [] },
        dupes: { label: 'May be listed twice', sql: "EXISTS (SELECT 1 FROM organizations o2 WHERE o2.name_key = o.name_key AND o2.id != o.id AND o2.archived = 0 AND o.name_key != '' AND (o.state IS o2.state OR o.state IS NULL OR o2.state IS NULL) AND (o.county IS o2.county OR o.county IS NULL OR o2.county IS NULL))", params: [] },
      };
    case 'contacts':
      return {
        mine: { label: 'Mine', sql: 'c.owner_id = ?', params: [userId] },
        noreach: { label: 'No email or phone', sql: "(c.email IS NULL OR c.email = '') AND (c.phone IS NULL OR c.phone = '')", params: [] },
        noorg: { label: 'No group', sql: 'c.org_id IS NULL', params: [] },
        dnc: { label: 'Do not contact', sql: 'c.do_not_contact = 1', params: [] },
      };
    default:
      return {};
  }
}
