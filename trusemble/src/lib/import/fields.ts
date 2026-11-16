import { DECISION_ROLES, ORG_TYPES, PRIORITIES, PROJECT_STAGES, REQUEST_KINDS, REQUEST_STATUSES, STATE_OPTS, US_STATES, type Opt } from '../constants';

export type ImportEntity = 'organizations' | 'contacts' | 'requests' | 'projects';
export type ImportField = { name: string; label: string; required?: boolean; synonyms: string[] };

const f = (name: string, label: string, synonyms: string[], required = false): ImportField => ({ name, label, required, synonyms });

export const IMPORT_FIELDS: Record<ImportEntity, ImportField[]> = {
  organizations: [
    f('name', 'Name', ['name', 'organization', 'organisation', 'org', 'orgname', 'organizationname', 'company', 'community', 'site'], true),
    f('type', 'Type', ['type', 'orgtype', 'organizationtype', 'category', 'kind']),
    f('website', 'Website', ['website', 'url', 'web', 'site', 'link', 'homepage']),
    f('city', 'City', ['city', 'town']),
    f('county', 'County', ['county']),
    f('state', 'State', ['state', 'st']),
  ],
  contacts: [
    f('name', 'Name', ['name', 'contact', 'contactname', 'person', 'fullname'], true),
    f('title', 'Title', ['title', 'jobtitle', 'position', 'role']),
    f('organization', 'Organization', ['organization', 'organisation', 'org', 'company', 'employer', 'funder']),
    f('email', 'Email', ['email', 'emailaddress', 'mail']),
    f('phone', 'Phone', ['phone', 'telephone', 'tel', 'mobile', 'phonenumber']),
    f('decision_role', 'Decision role', ['decisionrole', 'decision', 'authority']),
  ],
  requests: [
    f('from_name', 'From', ['from', 'name', 'organization', 'organisation', 'org', 'funder', 'prospect', 'account', 'company', 'client'], true),
    f('ref', 'Reference', ['ref', 'reference', 'id', 'ticket']),
    f('kind', 'Kind', ['kind', 'type', 'category', 'pipeline']),
    f('status', 'Status', ['status', 'stage']),
    f('substatus', 'Detail', ['detail', 'substatus', 'statusdetail', 'outreachstatus', 'outreach']),
    f('priority', 'Priority', ['priority', 'tier', 'importance']),
    f('amount_text', 'Amount', ['amount', 'ask', 'size', 'range', 'fundingamount', 'dollar']),
    f('next_action', 'Next action', ['nextaction', 'nextstep', 'nextsteps', 'action', 'followup']),
    f('next_action_date', 'Next action date', ['nextactiondate', 'nextdate', 'duedate', 'due', 'followupdate']),
    f('owner', 'Owner', ['owner', 'assignedto', 'assignee', 'lead']),
    f('contact', 'Contact', ['contact', 'contactname', 'person']),
    f('organization', 'Organization', ['organization', 'organisation', 'org', 'company']),
    f('email', 'Contact email', ['email', 'emailaddress']),
    f('phone', 'Contact phone', ['phone', 'telephone']),
    f('message', 'Notes', ['notes', 'note', 'comments', 'comment', 'message', 'description']),
  ],
  projects: [
    f('name', 'Project name', ['name', 'project', 'projectname', 'title'], true),
    f('organization', 'Owner', ['owner', 'organization', 'organisation', 'org', 'sponsor', 'agency']),
    f('stage', 'Stage', ['stage', 'status', 'phase']),
    f('county', 'County', ['county']),
    f('state', 'State', ['state', 'st']),
    f('needs', 'Needs', ['needs', 'need']),
    f('requested_amount', 'Amount requested', ['requested', 'requestedamount', 'amount', 'ask', 'cost', 'budget']),
    f('description', 'Description', ['description', 'summary', 'scope', 'details']),
    f('lat', 'Latitude', ['lat', 'latitude']),
    f('lng', 'Longitude', ['lng', 'lon', 'long', 'longitude']),
  ],
};

export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Best-guess column to field mapping from header names. Each field is used at most once. */
export function guessMapping(entity: ImportEntity, headers: string[]): Record<string, string> {
  const fields = IMPORT_FIELDS[entity];
  const out: Record<string, string> = {};
  const used = new Set<string>();
  // exact synonym order matters: earlier synonyms win
  for (const fld of fields) {
    for (const syn of fld.synonyms) {
      const h = headers.find((x) => normHeader(x) === syn && !out[x]);
      if (h && !used.has(fld.name)) { out[h] = fld.name; used.add(fld.name); break; }
    }
  }
  for (const h of headers) if (!out[h]) out[h] = '';
  return out;
}

export function guessEntity(sheetNames: string[], headersBySheet: string[][]): ImportEntity {
  const names = sheetNames.join(' ').toLowerCase();
  if (/contact tracker|follow|pipeline|dnc/.test(names)) return 'requests';
  const heads = new Set(headersBySheet.flat().map(normHeader));
  if (heads.has('email') && (heads.has('title') || heads.has('phone'))) return 'contacts';
  if (heads.has('project') || heads.has('projectname') || heads.has('stage')) return 'projects';
  return 'organizations';
}

export const KNOWN_LAYOUTS = [{ id: 'fups', label: 'TruSemble Followups (fups.xlsx)', test: (sheets: string[]) => sheets.some((s) => /contact tracker/i.test(s)) }];

const SYN: Record<string, Record<string, string>> = {
  type: { nonprofit: 'nonprofit', nonprofitorganization: 'nonprofit', '501c3': 'nonprofit', firewise: 'firewise_community', firewiseusa: 'firewise_community', firedepartment: 'fire_district', firedistrict: 'fire_district', government: 'state_agency', federal: 'federal_agency', vc: 'investor', venturecapital: 'investor', fund: 'investor' },
  stage: { active: 'in_progress', ongoing: 'in_progress', completed: 'complete', done: 'complete', proposed: 'planning', needsfunding: 'seeking_funding' },
  status: { open: 'new', notstarted: 'new', contacted: 'qualified', inconversation: 'qualified', inprogress: 'matching', applied: 'matching', intromade: 'intro_made', introduction: 'intro_made', passed: 'closed', won: 'closed', lost: 'closed', done: 'closed' },
  priority: { medium: 'normal', med: 'normal', p0: 'critical', p1: 'high', p2: 'normal', p3: 'low', urgent: 'critical' },
  kind: { investor: 'fundraising', funder: 'fundraising', grant: 'fundraising', customer: 'client', prospect: 'client' },
};

export function enumValue(kind: 'type' | 'stage' | 'status' | 'priority' | 'kind' | 'decision_role' | 'state', raw: string | null): string | null {
  if (!raw) return null;
  const n = normHeader(raw);
  const opts: readonly Opt[] =
    kind === 'type' ? ORG_TYPES : kind === 'stage' ? PROJECT_STAGES : kind === 'status' ? REQUEST_STATUSES :
    kind === 'priority' ? PRIORITIES : kind === 'kind' ? REQUEST_KINDS : kind === 'state' ? STATE_OPTS : DECISION_ROLES;
  const hit = opts.find((o) => normHeader(o[0]) === n || normHeader(o[1]) === n);
  if (hit) return hit[0];
  if (kind === 'state') {
    const byName = Object.entries(US_STATES).find(([, name]) => normHeader(name) === n);
    return byName ? byName[0] : null;
  }
  return SYN[kind]?.[n] ?? null;
}
