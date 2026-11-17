import {
  DECISION_ROLES, ORG_TYPES, PRECISIONS, PRIORITIES, PROGRAM_SCOPES, PROGRAM_TYPES, PROJECT_CATEGORIES,
  PROJECT_STAGES, REQUEST_KINDS, REQUEST_STATUSES, STATE_OPTS, type Opt,
} from './constants';

export type FieldType = 'text' | 'textarea' | 'select' | 'number' | 'date' | 'url' | 'email' | 'tel' | 'checkbox' | 'ref' | 'tags';
export type RefKind = 'organizations' | 'contacts' | 'projects' | 'users' | 'programs';

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  options?: readonly Opt[];
  ref?: RefKind;
  required?: boolean;
  help?: string;
  placeholder?: string;
  wide?: boolean;
  group?: string;
  suggestions?: readonly string[];
};

export type EntityKey = 'organizations' | 'projects' | 'contacts' | 'programs' | 'requests';

export type FilterDef = {
  name: string;
  label: string;
  options: readonly Opt[];
  /** Returns a SQL clause (with ? placeholders) and its params for a chosen value. */
  clause: (value: string) => { sql: string; params: (string | number)[] } | null;
};

export type EntityCfg = {
  key: EntityKey;
  slug: string; // URL segment under /ops
  table: string;
  alias: string;
  singular: string;
  plural: string;
  description: string;
  titleCol: string; // column in `table` used as the display name
  fields: Field[];
  search: string[]; // columns, alias-qualified
  from: string; // FROM + JOINs (alias already applied)
  select: string;
  orderBy: string;
  filters: FilterDef[];
  hasPublished?: boolean;
  newLabel: string;
  verifiable: boolean;
};

const yesNo: Opt[] = [['yes', 'Yes'], ['no', 'No']];

const archivedFilter = (a: string): FilterDef => ({
  name: 'archived',
  label: 'Show',
  options: [['no', 'Active only'], ['yes', 'Archived only']],
  clause: (v) => (v === 'yes' ? { sql: `${a}.archived = 1`, params: [] } : v === 'no' ? { sql: `${a}.archived = 0`, params: [] } : null),
});

const ownerFilter = (col: string): FilterDef => ({
  name: 'owner',
  label: 'Owner',
  options: [['none', 'Unassigned']],
  clause: (v) => (v === 'none' ? { sql: `${col} IS NULL`, params: [] } : /^\d+$/.test(v) ? { sql: `${col} = ?`, params: [Number(v)] } : null),
});

export const ENTITIES: Record<EntityKey, EntityCfg> = {
  organizations: {
    key: 'organizations', slug: 'organizations', table: 'organizations', alias: 'o', singular: 'organization', plural: 'organizations',
    description: 'Firewise sites, HOAs, fire districts, agencies, funders and crews', titleCol: 'name', newLabel: 'New organization', verifiable: true, hasPublished: true,
    from: 'organizations o', 
    select: `o.id, o.name, o.type, o.county, o.state, o.website, o.verification, o.published, o.archived,
      (SELECT COUNT(*) FROM projects p WHERE p.owner_org_id = o.id AND p.archived = 0) AS projects,
      (SELECT COUNT(*) FROM contacts c WHERE c.org_id = o.id AND c.archived = 0) AS people`,
    search: ['o.name', 'o.county', 'o.website', 'o.state'],
    orderBy: 'lower(o.name)',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ORG_TYPES, required: true },
      { name: 'website', label: 'Website', type: 'url', placeholder: 'https://' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'county', label: 'County', type: 'text' },
      { name: 'state', label: 'State', type: 'select', options: STATE_OPTS },
      { name: 'lat', label: 'Latitude', type: 'number', group: 'Location' },
      { name: 'lng', label: 'Longitude', type: 'number', group: 'Location' },
      { name: 'location_precision', label: 'How exact the location is', type: 'select', options: PRECISIONS, group: 'Location' },
      { name: 'published', label: 'Show on the website map', type: 'checkbox', group: 'Publication' },
      { name: 'notes', label: 'Internal notes', type: 'textarea', wide: true, group: 'Publication' },
    ],
    filters: [
      { name: 'type', label: 'Type', options: ORG_TYPES, clause: (v) => ({ sql: 'o.type = ?', params: [v] }) },
      { name: 'county', label: 'County', options: [], clause: (v) => ({ sql: 'o.county = ?', params: [v] }) },
      { name: 'public', label: 'On the website', options: [['yes', 'Shown'], ['no', 'Hidden']], clause: (v) => ({ sql: 'o.published = ?', params: [v === 'yes' ? 1 : 0] }) },
      archivedFilter('o'),
    ],
  },
  projects: {
    key: 'projects', slug: 'projects', table: 'projects', alias: 'p', singular: 'project', plural: 'projects',
    description: 'Every mitigation project on record. Only published ones appear on the public map and project pages.', titleCol: 'name', newLabel: 'New project', verifiable: true, hasPublished: true,
    from: 'projects p LEFT JOIN organizations o ON o.id = p.owner_org_id',
    select: `p.id, p.name, o.name AS owner, p.owner_org_id, p.stage, p.category, p.county, p.state, p.needs, p.requested_amount, p.published, p.lat, p.verification, p.archived`,
    search: ['p.name', 'o.name', 'p.county'],
    orderBy: 'p.updated_at DESC, p.id DESC',
    fields: [
      { name: 'name', label: 'Project name', type: 'text', required: true },
      { name: 'owner_org_id', label: 'Owner', type: 'ref', ref: 'organizations' },
      { name: 'stage', label: 'Stage', type: 'select', options: PROJECT_STAGES, required: true },
      { name: 'category', label: 'Category', type: 'select', options: PROJECT_CATEGORIES, required: true },
      { name: 'description', label: 'What the work is', type: 'textarea', wide: true },
      { name: 'county', label: 'County', type: 'text', group: 'Place' },
      { name: 'state', label: 'State', type: 'select', options: STATE_OPTS, group: 'Place' },
      { name: 'lat', label: 'Latitude', type: 'number', group: 'Place' },
      { name: 'lng', label: 'Longitude', type: 'number', group: 'Place' },
      { name: 'location_precision', label: 'How exact the location is', type: 'select', options: PRECISIONS, group: 'Place' },
      { name: 'needs', label: 'Needs', type: 'text', help: 'Funding, crew, planning help', group: 'Money' },
      { name: 'requested_amount', label: 'Amount requested ($)', type: 'number', group: 'Money' },
      { name: 'budget_amount', label: 'Budget ($)', type: 'number', group: 'Money' },
      { name: 'acres', label: 'Acres', type: 'number', group: 'Money' },
      { name: 'source_url', label: 'Source link', type: 'url', group: 'Publication', wide: true },
      { name: 'published', label: 'Show on the website (map and project page)', type: 'checkbox', group: 'Publication' },
      { name: 'notes', label: 'Internal notes', type: 'textarea', wide: true, group: 'Publication' },
    ],
    filters: [
      { name: 'stage', label: 'Stage', options: PROJECT_STAGES, clause: (v) => ({ sql: 'p.stage = ?', params: [v] }) },
      {
        name: 'publication', label: 'On the website',
        options: [['published', 'Published'], ['private', 'Private'], ['not_on_map', 'Shown, but not on the map']],
        clause: (v) => v === 'published' ? { sql: 'p.published = 1', params: [] } : v === 'private' ? { sql: 'p.published = 0', params: [] } : v === 'not_on_map' ? { sql: 'p.published = 1 AND p.lat IS NULL', params: [] } : null,
      },
      { name: 'county', label: 'County', options: [], clause: (v) => ({ sql: 'p.county = ?', params: [v] }) },
      archivedFilter('p'),
    ],
  },
  contacts: {
    key: 'contacts', slug: 'contacts', table: 'contacts', alias: 'c', singular: 'contact', plural: 'contacts',
    description: 'People at partner organizations. Private to operators, never shown on any public page.', titleCol: 'name', newLabel: 'New contact', verifiable: true,
    from: 'contacts c LEFT JOIN organizations o ON o.id = c.org_id LEFT JOIN users u ON u.id = c.owner_id',
    select: `c.id, c.name, c.title, o.name AS organization, c.org_id, c.decision_role, c.email, c.phone, u.initials AS owner, c.do_not_contact, c.verification, c.archived`,
    search: ['c.name', 'c.email', 'c.title', 'o.name', 'c.phone'],
    orderBy: 'lower(c.name)',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'org_id', label: 'Organization', type: 'ref', ref: 'organizations' },
      { name: 'decision_role', label: 'Role in decisions', type: 'select', options: DECISION_ROLES },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'owner_id', label: 'Owner', type: 'ref', ref: 'users' },
      { name: 'do_not_contact', label: 'Do not contact', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
    filters: [
      { name: 'role', label: 'Role', options: DECISION_ROLES, clause: (v) => ({ sql: 'c.decision_role = ?', params: [v] }) },
      {
        name: 'reach', label: 'Contact details',
        options: [['email', 'Has email'], ['phone', 'Has phone'], ['none', 'No details']],
        clause: (v) => v === 'email' ? { sql: "c.email IS NOT NULL AND c.email != ''", params: [] } : v === 'phone' ? { sql: "c.phone IS NOT NULL AND c.phone != ''", params: [] } : v === 'none' ? { sql: "(c.email IS NULL OR c.email = '') AND (c.phone IS NULL OR c.phone = '')", params: [] } : null,
      },
      ownerFilter('c.owner_id'),
      archivedFilter('c'),
    ],
  },
  programs: {
    key: 'programs', slug: 'funding', table: 'programs', alias: 'pr', singular: 'funding program', plural: 'funding programs',
    description: 'Programs that pay for mitigation work, and the awards they have made. Committed and disbursed money are counted separately, never added together.',
    titleCol: 'name', newLabel: 'New funding program', verifiable: true, hasPublished: true,
    from: 'programs pr LEFT JOIN contacts c ON c.id = pr.contact_id',
    select: `pr.id, pr.name, pr.run_by, pr.type, pr.focus, pr.window_start, pr.window_end, pr.rolling, pr.award_min, pr.award_max, pr.award_text,
      pr.scope, pr.state, pr.counties, pr.url, pr.verification, pr.archived, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone,
      (SELECT COUNT(*) FROM awards a WHERE a.program_id = pr.id) AS awards`,
    search: ['pr.name', 'pr.run_by', 'pr.focus', 'pr.eligibility'],
    orderBy: 'pr.window_end IS NULL, pr.window_end ASC, lower(pr.name)',
    fields: [
      { name: 'name', label: 'Program name', type: 'text', required: true },
      { name: 'run_by', label: 'Run by', type: 'text' },
      { name: 'funded_by', label: 'Paid for by', type: 'text' },
      { name: 'type', label: 'Type', type: 'select', options: PROGRAM_TYPES, required: true },
      { name: 'focus', label: 'Pays for', type: 'tags', help: 'Comma separated, e.g. Fuels reduction, Defensible space', wide: true },
      { name: 'window_start', label: 'Window opens', type: 'date', group: 'Window and award' },
      { name: 'window_end', label: 'Window closes', type: 'date', group: 'Window and award', help: 'Leave both dates empty for a rolling program.' },
      { name: 'award_min', label: 'Award minimum ($)', type: 'number', group: 'Window and award' },
      { name: 'award_max', label: 'Award maximum ($)', type: 'number', group: 'Window and award' },
      { name: 'award_text', label: 'Award size, in words', type: 'text', group: 'Window and award', wide: true, help: 'Shown instead of the numbers when the program describes awards in its own way.' },
      { name: 'scope', label: 'Available in', type: 'select', options: PROGRAM_SCOPES, required: true, group: 'Reach' },
      { name: 'state', label: 'State', type: 'select', options: STATE_OPTS, group: 'Reach' },
      { name: 'counties', label: 'Counties', type: 'text', group: 'Reach', help: 'Comma separated, for county-level programs.' },
      { name: 'eligibility', label: 'Who can apply', type: 'textarea', wide: true, group: 'Reach' },
      { name: 'url', label: 'Program page', type: 'url', group: 'Reach', wide: true },
      { name: 'contact_id', label: 'Who to call', type: 'ref', ref: 'contacts', group: 'Reach' },
      { name: 'published', label: 'Show on the website funding page', type: 'checkbox', group: 'Reach' },
      { name: 'notes', label: 'Internal notes', type: 'textarea', wide: true, group: 'Reach' },
    ],
    filters: [
      { name: 'instrument', label: 'Kind', options: PROGRAM_TYPES, clause: (v) => ({ sql: 'pr.type = ?', params: [v] }) },
      { name: 'pays_for', label: 'Pays for', options: [], clause: (v) => ({ sql: 'lower(pr.focus) ILIKE ?', params: [`%${v.toLowerCase()}%`] }) },
      { name: 'available_in', label: 'Available in', options: [], clause: (v) => ({ sql: "(pr.scope = 'national' OR pr.state = ?)", params: [v] }) },
      { name: 'reach', label: 'Where', options: PROGRAM_SCOPES, clause: (v) => ({ sql: 'pr.scope = ?', params: [v] }) },
      { name: 'award_kind', label: 'Awards', options: [['has', 'Has awards on record'], ['none', 'No awards on record']], clause: (v) => v === 'has' ? { sql: 'EXISTS (SELECT 1 FROM awards a WHERE a.program_id = pr.id)', params: [] } : v === 'none' ? { sql: 'NOT EXISTS (SELECT 1 FROM awards a WHERE a.program_id = pr.id)', params: [] } : null },
      archivedFilter('pr'),
    ],
  },
  requests: {
    key: 'requests', slug: 'requests', table: 'requests', alias: 'r', singular: 'request', plural: 'requests',
    description: "Funding requests and project submissions from the public forms, and TruSemble's own fundraising and client pipeline.", titleCol: 'from_name', newLabel: 'New request', verifiable: true,
    from: 'requests r LEFT JOIN users u ON u.id = r.owner_id LEFT JOIN contacts c ON c.id = r.contact_id',
    select: `r.id, r.ref, r.from_name, r.kind, r.status, r.substatus, r.priority, r.amount_text, r.next_action, r.next_action_date, r.owner_id, u.initials AS owner, c.name AS contact, r.received_at, r.status_changed_at, r.verification, r.archived`,
    search: ['r.ref', 'r.from_name', 'c.name', 'r.next_action', 'r.message'],
    orderBy: `(r.status = 'closed'), CASE r.status WHEN 'new' THEN 0 WHEN 'needs_info' THEN 1 WHEN 'qualified' THEN 2 WHEN 'intro_made' THEN 3 WHEN 'matching' THEN 4 ELSE 5 END,
      CASE r.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, r.ref DESC`,
    fields: [
      { name: 'from_name', label: 'From', type: 'text', required: true, help: 'Person, organization or program that sent this' },
      { name: 'kind', label: 'Kind', type: 'select', options: REQUEST_KINDS, required: true },
      { name: 'status', label: 'Status', type: 'select', options: REQUEST_STATUSES, required: true },
      { name: 'substatus', label: 'Detail', type: 'text', help: 'For example Applied, Sent email, Warm callback' },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { name: 'amount_text', label: 'Amount', type: 'text', placeholder: '$25K to $100K' },
      { name: 'org_id', label: 'Organization', type: 'ref', ref: 'organizations' },
      { name: 'contact_id', label: 'Contact', type: 'ref', ref: 'contacts' },
      { name: 'project_id', label: 'Project', type: 'ref', ref: 'projects' },
      { name: 'owner_id', label: 'Owner', type: 'ref', ref: 'users', group: 'Next step' },
      { name: 'next_action_date', label: 'Next step date', type: 'date', group: 'Next step' },
      { name: 'next_action', label: 'What happens next', type: 'textarea', wide: true, group: 'Next step' },
      { name: 'message', label: 'Message or notes', type: 'textarea', wide: true, group: 'Next step' },
    ],
    filters: [
      { name: 'kind', label: 'Kind', options: REQUEST_KINDS, clause: (v) => ({ sql: 'r.kind = ?', params: [v] }) },
      ownerFilter('r.owner_id'),
      archivedFilter('r'),
    ],
  },
};

export function entityBySlug(slug: string): EntityCfg | null {
  return Object.values(ENTITIES).find((e) => e.slug === slug) ?? null;
}

/** The team tool has five places. Each has a few tabs; every page belongs to exactly one place. */
export type OpsGroup = { key: string; label: string; href: string; tabs: { href: string; label: string }[] };
export const OPS_GROUPS: OpsGroup[] = [
  { key: 'today', label: 'Today', href: '/ops', tabs: [{ href: '/ops', label: 'Today' }, { href: '/ops/pilot', label: 'Pilot goals' }] },
  { key: 'people', label: 'People', href: '/ops/requests', tabs: [{ href: '/ops/requests', label: 'Requests' }, { href: '/ops/contacts', label: 'Contacts' }, { href: '/ops/matches', label: 'Matches' }] },
  { key: 'projects', label: 'Projects and funding', href: '/ops/projects', tabs: [{ href: '/ops/projects', label: 'Projects' }, { href: '/ops/organizations', label: 'Organizations' }, { href: '/ops/funding', label: 'Funding programs' }] },
  { key: 'check', label: 'Check data', href: '/ops/check', tabs: [{ href: '/ops/check', label: 'To check' }, { href: '/ops/data-quality', label: 'Problems' }, { href: '/ops/imports', label: 'Import a file' }, { href: '/ops/sources', label: 'Sources' }, { href: '/ops/map', label: 'Map' }] },
  { key: 'settings', label: 'Settings', href: '/ops/settings', tabs: [{ href: '/ops/settings', label: 'Alerts' }, { href: '/ops/calculator', label: 'Calculator' }] },
];

export function groupFor(path: string): OpsGroup | null {
  if (path === '/ops') return OPS_GROUPS[0];
  let best: { g: OpsGroup; len: number } | null = null;
  for (const g of OPS_GROUPS) for (const t of g.tabs) {
    if (t.href !== '/ops' && (path === t.href || path.startsWith(t.href + '/')) && (!best || t.href.length > best.len)) best = { g, len: t.href.length };
  }
  return best?.g ?? null;
}

export { yesNo };
