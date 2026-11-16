export type Opt = readonly [value: string, label: string];

export const VERIFICATION = ['verified', 'unverified', 'demo'] as const;
export type Verification = (typeof VERIFICATION)[number];

export const ORG_TYPES: Opt[] = [
  ['firewise_community', 'Firewise community'],
  ['hoa', 'HOA'],
  ['fire_district', 'Fire district'],
  ['county', 'County'],
  ['state_agency', 'State agency'],
  ['federal_agency', 'Federal agency'],
  ['nonprofit', 'Nonprofit'],
  ['foundation', 'Foundation'],
  ['university', 'University'],
  ['workforce_corps', 'Workforce corps'],
  ['investor', 'Investor'],
  ['crew', 'Crew or contractor'],
  ['other', 'Other'],
];

export const PROJECT_STAGES: Opt[] = [
  ['planning', 'Planning'],
  ['seeking_funding', 'Seeking funding'],
  ['funded', 'Funded'],
  ['in_progress', 'In progress'],
  ['complete', 'Complete'],
];

export const PROJECT_CATEGORIES: Opt[] = [
  ['wildfire_mitigation', 'Wildfire mitigation'],
  ['fuels_reduction', 'Fuels reduction'],
  ['defensible_space', 'Defensible space'],
  ['community_planning', 'Community planning'],
  ['home_hardening', 'Home hardening'],
  ['forest_restoration', 'Forest restoration'],
  ['capacity_equipment', 'Capacity and equipment'],
  ['workforce', 'Workforce'],
];

export const PRECISIONS: Opt[] = [
  ['parcel', 'Parcel or address'],
  ['area_centre', 'Area centre'],
  ['community', 'Community'],
  ['county', 'County only'],
];

export const PROGRAM_TYPES: Opt[] = [
  ['grant', 'Grant'],
  ['donation', 'Donation'],
  ['loan', 'Loan'],
  ['investment', 'Investment'],
  ['other', 'Other'],
];

export const PROGRAM_SCOPES: Opt[] = [
  ['national', 'National'],
  ['state', 'Statewide'],
  ['counties', 'Specific counties'],
];

export const FOCUS_TAGS = [
  'Fuels reduction',
  'Defensible space',
  'Hazard mitigation',
  'Risk reduction',
  'Capacity',
  'Community planning',
  'Forest restoration',
  'Forestry',
  'Conservation',
  'Carbon',
  'Climate finance',
  'Equipment and technology',
  'Workforce',
  'Staffing',
  'Home hardening',
];

export const REQUEST_KINDS: Opt[] = [
  ['client', 'Client'],
  ['fundraising', 'Fundraising'],
  ['inquiry', 'Inquiry'],
  ['funding_request', 'Funding request'],
  ['project_submission', 'Project submission'],
  ['introduction', 'Introduction request'],
];

/** Overview wording. */
export const REQUEST_STATUSES: Opt[] = [
  ['new', 'New'],
  ['needs_info', 'Waiting on them'],
  ['qualified', 'Talking'],
  ['matching', 'Working on it'],
  ['intro_made', 'Introduced'],
  ['closed', 'Closed'],
];
/** Requests page wording for the same statuses. */
export const REQUEST_STATUS_PILL: Record<string, string> = {
  new: 'New',
  needs_info: 'Waiting on them',
  qualified: 'Talking',
  matching: 'Working on it',
  intro_made: 'Introduced',
  closed: 'Closed',
};

/** Plain words for how far a record has been checked. */
export const CHECK_LABEL: Record<string, string> = { verified: 'Checked by a person', unverified: 'Not yet checked', demo: 'Sample' };

export const PRIORITIES: Opt[] = [
  ['critical', 'Critical'],
  ['high', 'High'],
  ['normal', 'Normal'],
  ['low', 'Low'],
];

export const DECISION_ROLES: Opt[] = [
  ['program_officer', 'Program officer'],
  ['decision_maker', 'Decision maker'],
  ['influencer', 'Influencer'],
  ['gatekeeper', 'Gatekeeper'],
  ['champion', 'Champion'],
];

export const SOURCE_KINDS: Opt[] = [
  ['public_record', 'Public record'],
  ['website', 'Website'],
  ['spreadsheet', 'Spreadsheet'],
  ['meeting', 'Meeting'],
];

export const label = (opts: readonly Opt[], v: string | null | undefined): string =>
  opts.find((o) => o[0] === v)?.[1] ?? (v ? v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};
export const STATE_OPTS: Opt[] = Object.entries(US_STATES).map(([k, v]) => [k, v]);

export const BRAND = {
  name: 'TruSemble',
  tagline: 'A sourced record of wildfire mitigation across the US: where the money went, and where it has not.',
  byline: 'A Sharing Green Economy innovation.',
};
