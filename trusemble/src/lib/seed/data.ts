// Static seed content. Programs, requests and sources are transcribed from the operations app and public site
// screens. No personal contact details are included anywhere in this file.

export type SeedProgram = {
  name: string; run_by: string; funded_by?: string; type: 'grant' | 'donation' | 'loan' | 'investment' | 'other'; focus: string;
  start?: string; end?: string; min?: number; max?: number; award_text?: string; scope: 'national' | 'state' | 'counties'; state?: string;
  counties?: string; eligibility?: string; url?: string; ref?: string; published?: boolean; verified?: boolean; checked?: string;
};

const FEMA_LOCAL = 'FEMA Hazard Mitigation Assistance. States, tribes and territories apply; local governments apply through them as subapplicants. These rows are the local projects inside state awards.';
const USASP = (n: string) => `Federal assistance listing ${n}. Awards are recorded from USAspending.gov by place of performance; see the program page for eligibility.`;

export const PROGRAMS: SeedProgram[] = [
  { name: 'Landscape Scale Restoration Grant Program for Non-Federal Lands', run_by: 'USDA Forest Service', type: 'grant', focus: 'Forestry', start: '2026-10-28', end: '2027-01-26', min: 100000, max: 600000, scope: 'national', eligibility: 'Eligible applicants: Native American tribal governments (Federally recognized); Native American tribal organizations (other than Federally recognized tribal governments); State governments; Public and State controlled institutions of higher education.', url: 'https://www.fs.usda.gov/managing-land/private-land/landscape-scale-restoration' },
  { name: 'Landscape Scale Restoration Grant Program for Tribes', run_by: 'USDA Forest Service', type: 'grant', focus: 'Forestry', start: '2026-10-28', end: '2027-01-26', min: 100000, max: 300000, scope: 'national', eligibility: 'Eligible applicants: Native American tribal organizations (other than Federally recognized tribal governments); Native American tribal governments (Federally recognized). Tribal organizations as defined in 25 USC 5304 (l) are eligible to apply at the request of a tribe.', url: 'https://www.fs.usda.gov/managing-land/private-land/landscape-scale-restoration' },
  { name: 'FEMA Building Resilient Infrastructure and Communities (BRIC)', run_by: 'Federal Emergency Management Agency', type: 'grant', focus: 'Hazard mitigation', scope: 'national', ref: '97.047', eligibility: USASP('97.047'), url: 'https://www.fema.gov/grants/mitigation' },
  { name: 'FEMA Building Resilient Infrastructure and Communities (local subapplications)', run_by: 'Federal Emergency Management Agency', type: 'grant', focus: 'Hazard mitigation', scope: 'national', eligibility: FEMA_LOCAL, url: 'https://www.fema.gov/grants/mitigation' },
  { name: 'FEMA Fire Management Assistance Grant - Hazard Mitigation Grant Program (local subapplications)', run_by: 'Federal Emergency Management Agency', type: 'grant', focus: 'Hazard mitigation', scope: 'national', eligibility: FEMA_LOCAL, url: 'https://www.fema.gov/grants/mitigation' },
  { name: 'FEMA Hazard Mitigation Grant Program (HMGP)', run_by: 'Federal Emergency Management Agency', type: 'grant', focus: 'Hazard mitigation', scope: 'national', ref: '97.039', eligibility: USASP('97.039'), url: 'https://www.fema.gov/grants/mitigation' },
  { name: 'FEMA Hazard Mitigation Grant Program (local subapplications)', run_by: 'Federal Emergency Management Agency', type: 'grant', focus: 'Hazard mitigation', scope: 'national', eligibility: FEMA_LOCAL, url: 'https://www.fema.gov/grants/mitigation' },
  { name: 'FEMA Hazard Mitigation Grant Program Post Fire (local subapplications)', run_by: 'Federal Emergency Management Agency', type: 'grant', focus: 'Hazard mitigation', scope: 'national', eligibility: FEMA_LOCAL, url: 'https://www.fema.gov/grants/mitigation' },
  { name: 'FEMA Legislative Pre-Disaster Mitigation (local subapplications)', run_by: 'Federal Emergency Management Agency', type: 'grant', focus: 'Hazard mitigation', scope: 'national', eligibility: FEMA_LOCAL, url: 'https://www.fema.gov/grants/mitigation' },
  { name: 'FEMA Pre-Disaster Mitigation (local subapplications)', run_by: 'Federal Emergency Management Agency', type: 'grant', focus: 'Hazard mitigation', scope: 'national', eligibility: FEMA_LOCAL, url: 'https://www.fema.gov/grants/mitigation' },
  { name: 'NRCS Environmental Quality Incentives Program (EQIP)', run_by: 'Natural Resources Conservation Service', type: 'grant', focus: 'Conservation, Forestry', min: 500, max: 45000, scope: 'national', verified: true, checked: '2026-11-06', ref: '10.912', eligibility: 'Owners, landlords, operators or tenants of eligible agricultural land or non-industrial private forestland. Applicant must control the land and have a conservation plan. Application deadlines are set by regional and local NRCS offices. See program page.', url: 'https://www.nrcs.usda.gov/programs-initiatives/eqip-environmental-quality-incentives' },
  { name: 'ODF Landscape Resiliency Program', run_by: 'Oregon Department of Forestry', type: 'grant', focus: 'Fuels reduction, Landscape resiliency', award_text: 'ODF work group expected cross-boundary proposals of $2-5 million (program FAQ)', scope: 'state', state: 'OR', eligibility: 'Landscape-scale, cross-boundary projects on public and private forestlands and rangelands and in communities near homes and critical infrastructure. At least 70% of funds to hazardous fuel treatment; at least 10% to monitoring and evaluation.', url: 'https://www.oregon.gov/odf/pages/landscape-resiliency-program.aspx' },
  { name: 'ODF Small Forestland Grant Program (SFGP)', run_by: 'Oregon Department of Forestry', type: 'grant', focus: 'Fuels reduction', min: 10000, max: 300000, scope: 'state', state: 'OR', eligibility: 'Small forestland owners (up to 160 acres west of the Cascade crest, up to 640 acres east), alone or as a group such as an HOA. Projects must reduce hazardous fuels; at least 75% of costs go to fuel reduction treatment on small forestland owner properties. 25% may go to planning and outreach.', url: 'https://www.oregon.gov/odf/Pages/small-forestland-grant-program.aspx' },
  { name: 'Oregon Conservation Corps grants (HECC)', run_by: 'Oregon Higher Education Coordinating Commission', type: 'grant', focus: 'Fuels reduction, Workforce', scope: 'state', state: 'OR', eligibility: 'Local partners running youth-focused wildfire fuels mitigation crews with job training, in coordination with local fire districts. One-time legislative funding (SB 762 in 2021, SB 5506 in 2023, partial HB 5006 for 2025-27); 2027-29 funding uncertain per HECC.' },
  { name: 'OSFM community risk reduction fund', run_by: 'Oregon State Fire Marshal', type: 'grant', focus: 'Risk reduction', scope: 'counties', state: 'OR', counties: 'Oregon (25 counties)', eligibility: 'Eligibility as summarized on the Sharing Green Economy opportunity map (June 2026). Check the OSFM investments page for the current program.', url: 'https://www.oregon.gov/osfm/wildfire/pages/investments-for-oregon.aspx' },
  { name: 'OSFM Community Wildfire Risk Reduction for the Built Environment (2024)', run_by: 'Oregon State Fire Marshal', type: 'grant', focus: 'Defensible space', scope: 'state', state: 'OR', eligibility: 'Structural fire protection agencies, counties and cities. Defensible space and community protection projects; competitive, prioritized by fire risk, social vulnerability and project clarity. Awards announced November 2024.', url: 'https://www.oregon.gov/osfm/Documents/CWRR_Grant_Awardees.pdf' },
  { name: 'OSFM Wildfire Season Staffing Grant', run_by: 'Oregon State Fire Marshal', type: 'grant', focus: 'Staffing', max: 35000, scope: 'state', state: 'OR', eligibility: 'Local fire districts and departments, to hire additional firefighters for the wildfire season. The 2025 round funded 200 agencies.', url: 'https://www.oregon.gov/osfm/wildfire/pages/investments-for-oregon.aspx' },
  { name: 'USDA Forest Service Community Wildfire Defense Grant (CWDG)', run_by: 'USDA Forest Service', type: 'grant', focus: 'CWPP, Fuels reduction', scope: 'national', ref: '10.720', eligibility: 'Communities at risk of wildfire, including local governments, nonprofits, HOAs, Tribes and state forestry agencies. Funds developing or revising Community Wildfire Protection Plans and projects in a CWPP less than ten years old.', url: 'https://www.fs.usda.gov/managing-land/fire/grants/cwdg' },
  { name: 'USDA Forest Service Cooperative Forestry Assistance', run_by: 'USDA Forest Service', type: 'grant', focus: 'Forestry, Fuels reduction', scope: 'national', ref: '10.664', eligibility: USASP('10.664'), url: 'https://www.fs.usda.gov/managing-land/private-land' },
  { name: 'OSFM Community Wildfire Risk Reduction Grant (2023)', run_by: 'Oregon State Fire Marshal', type: 'grant', focus: 'Risk reduction', end: '2023-02-01', scope: 'state', state: 'OR', eligibility: 'Local governments, special districts, structural fire service agencies and non-governmental organizations. Funds wildfire risk reduction projects, equipment and staff. Awards announced May 2023.', url: 'https://www.oregon.gov/osfm/Documents/CWRR.Recipients.pdf' },
  { name: 'ODF Volunteer Fire Capacity grants (2026)', run_by: 'Oregon Department of Forestry', funded_by: 'USDA Forest Service', type: 'grant', focus: 'Capacity', start: '2026-03-06', end: '2026-04-18', scope: 'state', state: 'OR', eligibility: 'Rural fire agencies, for firefighting and emergency response needs; federally funded. Notice of award June 30, 2026; purchasing period Oct 1, 2026 to Sept 30, 2027.', url: 'https://www.oregon.gov/odf/aboutodf/pages/grantsincentives.aspx' },
  { name: 'Deschutes County Fuel Reduction Grant (fall 2026)', run_by: 'Deschutes County', type: 'grant', focus: 'Fuels reduction, Defensible space', start: '2026-09-01', end: '2026-10-01', award_text: 'No minimum or maximum; awards anticipated $100 to $5,000 from a $50,000 fall 2026 allocation', scope: 'counties', state: 'OR', counties: 'Deschutes', eligibility: 'Communities and neighborhoods working at neighborhood or community scale; individual properties are not eligible. Preference for Firewise USA sites and projects in a Firewise action plan. Tax ID or fiscal sponsor required. Applicants notified by early November.', url: 'https://www.deschutescounty.gov/716/2026-Fall-Fuel-Reduction-Grant-Program' },

  // Not shown on the public funding page (private funders and loans tracked by operators)
  { name: 'The Bend Foundation grants', run_by: 'The Bend Foundation', type: 'donation', focus: 'Conservation, Capacity', end: '2027-03-15', scope: 'counties', state: 'OR', counties: 'Deschutes, Crook, Jefferson', published: false },
  { name: '100+ Women Who Care Central Oregon (giving circle)', run_by: '100+ Women Who Care Central Oregon', type: 'donation', focus: 'Capacity, Community planning', award_text: '$100 from each member, once a quarter', scope: 'counties', state: 'OR', counties: 'Deschutes, Crook, Jefferson', published: false },
  { name: 'American Forest Foundation, Family Forest Carbon Program', run_by: 'American Forest Foundation', type: 'other', focus: 'Carbon, Forest restoration', scope: 'national', published: false },
  { name: 'American Forests restoration partnerships', run_by: 'American Forests', type: 'donation', focus: 'Forest restoration, Workforce', scope: 'national', published: false },
  { name: 'Arbor Day Foundation reforestation partnerships', run_by: 'Arbor Day Foundation', type: 'donation', focus: 'Forest restoration', scope: 'national', published: false },
  { name: 'Bezos Earth Fund', run_by: 'Bezos Earth Fund', type: 'donation', focus: 'Carbon, Conservation, Climate finance', scope: 'national', published: false },
  { name: 'Blue Forest, Forest Resilience Bond', run_by: 'Blue Forest', type: 'investment', focus: 'Fuels reduction, Forest restoration, Climate finance', scope: 'counties', state: 'CA', counties: 'Western U.S. forests', published: false },
  { name: 'Breakthrough Energy Ventures', run_by: 'Breakthrough Energy', type: 'investment', focus: 'Climate finance, Equipment and technology', scope: 'national', published: false },
  { name: 'Brooks Resources community grants', run_by: 'Brooks Resources Corporation', type: 'donation', focus: 'Capacity, Community planning', award_text: 'Usually $100 to $5,000, average $2,500', scope: 'counties', state: 'OR', counties: 'Deschutes, Crook, Jefferson', published: false },
  { name: 'Business Oregon Special Public Works Fund', run_by: 'Business Oregon', type: 'loan', focus: 'Equipment and technology, Hazard mitigation', scope: 'state', state: 'OR', published: false },
  { name: 'City Forest Credits', run_by: 'City Forest Credits', type: 'other', focus: 'Carbon, Forest restoration, Community planning', scope: 'national', published: false },
  { name: 'Convective Capital (wildfire tech venture fund)', run_by: 'Convective Capital', type: 'investment', focus: 'Equipment and technology, Research', scope: 'national', published: false },
  { name: 'Craft3 community loans', run_by: 'Craft3', type: 'loan', focus: 'Capacity, Climate finance', scope: 'state', state: 'OR', published: false },
  { name: 'Deschutes County Fuel Reduction Grant Program', run_by: 'Deschutes County Natural Resources', type: 'grant', focus: 'Fuels reduction, Risk reduction', award_text: 'Usually $100 to $5,000', scope: 'counties', state: 'OR', counties: 'Deschutes', published: false },
  { name: 'Elemental Impact', run_by: 'Elemental Impact', type: 'investment', focus: 'Climate finance, Equipment and technology, Community planning', scope: 'national', published: false },
  { name: 'FEMA Safeguarding Tomorrow Revolving Loan Fund (STORM)', run_by: 'Federal Emergency Management Agency', type: 'loan', focus: 'Hazard mitigation, Home hardening, Community planning', award_text: 'At most 1% interest; loans under $5 million', scope: 'national', published: false },
];

export type SeedRequest = {
  ref: string; from: string; kind: 'client' | 'fundraising' | 'inquiry'; status: 'new' | 'qualified' | 'matching' | 'intro_made' | 'closed';
  sub?: string; priority?: 'critical' | 'high' | 'normal' | 'low'; amount?: string; received: string; message?: string;
};

export const REQUESTS: SeedRequest[] = [
  { ref: 'TS-2026-0033', from: 'Baruch Future Ventures', kind: 'fundraising', status: 'qualified', sub: 'Contacted', priority: 'critical', amount: '$150K - $500K', received: '2026-06-29' },
  { ref: 'TS-2026-0034', from: 'Mastersfund / Sybilla Masters Fund', kind: 'fundraising', status: 'qualified', sub: 'Contacted', priority: 'critical', amount: '$50K - $250K', received: '2026-06-29' },
  { ref: 'TS-2026-0035', from: 'Baruch Future Ventures', kind: 'fundraising', status: 'intro_made', sub: 'Warm - Intro Made', priority: 'critical', amount: '$250K - $1M+', received: '2026-06-29' },
  { ref: 'TS-2026-0036', from: 'Deschutes County Org with Fire', kind: 'client', status: 'matching', sub: 'Warm - Callback requested', priority: 'critical', amount: '$3,000 + 2%', received: '2026-06-29' },
  { ref: 'TS-2026-0037', from: 'Elemental Excelerator', kind: 'fundraising', status: 'matching', sub: 'Applied', priority: 'critical', amount: '$25K - $200K', received: '2026-06-29' },
  { ref: 'TS-2026-0038', from: 'MassChallenge', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: 'Up to $100K', received: '2026-11-05' },
  { ref: 'TS-2026-0039', from: 'NSF SBIR', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: 'Up to $305K', received: '2026-11-05' },
  { ref: 'TS-2026-0040', from: 'Creative Destruction Lab', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: '$100K - $1M from partners', received: '2026-11-05' },
  { ref: 'TS-2026-0041', from: '9Zero Capital', kind: 'fundraising', status: 'matching', sub: 'Applied - Conditional', priority: 'high', amount: 'Co-invest when ready', received: '2026-06-29' },
  { ref: 'TS-2026-0042', from: 'Lowercarbon Capital', kind: 'fundraising', status: 'matching', sub: 'Applied', priority: 'low', received: '2026-06-29' },
  { ref: 'TS-2026-0043', from: 'Astanor', kind: 'fundraising', status: 'matching', sub: 'Applied', priority: 'low', received: '2026-06-29' },
  { ref: 'TS-2026-0044', from: 'Builders Vision', kind: 'fundraising', status: 'matching', sub: 'Applied', priority: 'low', received: '2026-06-29' },
  { ref: 'TS-2026-0045', from: 'Encourage Capital', kind: 'fundraising', status: 'matching', sub: 'Applied', priority: 'low', received: '2026-06-29' },
  { ref: 'TS-2026-0046', from: 'The Ford Family Foundation', kind: 'fundraising', status: 'matching', sub: 'Applied', priority: 'low', received: '2026-06-29' },
  { ref: 'TS-2026-0047', from: 'The Marie Lamfrom Charitable Foundation', kind: 'fundraising', status: 'matching', sub: 'Applied', priority: 'low', received: '2026-06-29' },
  { ref: 'TS-2026-0048', from: 'Oregon Living with Fire', kind: 'client', status: 'new', sub: 'Not Contacted', priority: 'critical', amount: 'Multiple $3K', received: '2026-11-05' },
  { ref: 'TS-2026-0049', from: 'Utah FFSL', kind: 'client', status: 'qualified', sub: 'Sent email on 6/29/26', priority: 'high', amount: '$3,000 + 2%', received: '2026-06-29' },
  { ref: 'TS-2026-0050', from: 'Boulder County Wildfire Partners', kind: 'client', status: 'qualified', sub: 'Sent email on 6/29/26', priority: 'high', amount: '$3,000 + 2%', received: '2026-06-29' },
  { ref: 'TS-2026-0051', from: 'Summit County Extension', kind: 'client', status: 'qualified', sub: 'Sent email on 6/29/26', priority: 'high', amount: '$3,000 + 2%', received: '2026-06-29' },
  { ref: 'TS-2026-0052', from: 'Wallowa Soil and Water Conservation District', kind: 'client', status: 'new', sub: 'Not Contacted', priority: 'high', amount: '$3,000 + 2%', received: '2026-11-05' },
  { ref: 'TS-2026-0053', from: 'ModelPaths', kind: 'fundraising', status: 'qualified', sub: 'Sent email - no reply', priority: 'high', amount: '$500 - $2,000', received: '2026-06-29' },
  { ref: 'TS-2026-0054', from: 'Oregon APEX Accelerator', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: 'Free - Leads to contracts', received: '2026-11-05' },
  { ref: 'TS-2026-0055', from: 'Oregon Venture Fund', kind: 'fundraising', status: 'closed', sub: 'Passed - Revisit Later', priority: 'low', amount: 'TBD', received: '2026-06-29' },
  { ref: 'TS-2026-0056', from: 'Tollgate Property Owners Association', kind: 'client', status: 'matching', sub: 'Proposal Sent - Pending', priority: 'critical', amount: '$3,000 + 2%', received: '2026-06-29' },
  { ref: 'TS-2026-0057', from: 'EPA SBIR', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: '$150K - $300K', received: '2026-11-05' },
  { ref: 'TS-2026-0058', from: 'DOE SBIR', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: '$200K - $300K', received: '2026-11-05' },
  { ref: 'TS-2026-0059', from: 'Oregon Community Foundation', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: '$25K - $100K', received: '2026-11-05' },
  { ref: 'TS-2026-0060', from: 'USDA Wildland Fire Service', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: '$25K - $250K+', received: '2026-11-05' },
  { ref: 'TS-2026-0061', from: 'XPRIZE Wildfire', kind: 'fundraising', status: 'new', sub: 'Not Started', priority: 'high', amount: '$11M total prize pool', received: '2026-11-05' },
  { ref: 'TS-2026-0062', from: 'EDF', kind: 'fundraising', status: 'qualified', sub: 'Follow Up Sent', priority: 'critical', amount: '$25K - $100K', received: '2026-06-29' },
  { ref: 'TS-2026-0063', from: 'EDF', kind: 'fundraising', status: 'qualified', sub: 'Follow Up Sent', priority: 'critical', amount: '$25K - $100K', received: '2026-06-29' },
  { ref: 'TS-2026-0064', from: 'EDF', kind: 'fundraising', status: 'qualified', sub: 'Follow Up Sent', priority: 'critical', amount: '$25K - $100K', received: '2026-06-29' },
  { ref: 'TS-2026-0066', from: 'AM Collective test', kind: 'inquiry', status: 'new', received: '2026-11-12', message: 'TEST - delete me' },
];

// [slug, name, url, kind, description, fetched?]
export type SeedSource = { slug: string; name: string; url?: string; kind: 'public_record' | 'website' | 'spreadsheet' | 'meeting'; description?: string; priv?: boolean };

export const SOURCES: SeedSource[] = [
  { slug: 'usaspending', name: 'USAspending.gov federal wildfire and forestry grants, every state (CWDG, BRIC, HMGP, EQIP, Cooperative Forestry)', url: 'https://api.usaspending.gov/api/v2/search/spending_by_award/', kind: 'public_record', description: 'Federal obligations since 2021 under CFDA 10.720, 97.047, 97.039, 10.912, 10.664. Amounts are obligations, not spend. Recipients are organizations; no people.' },
  { slug: 'fs-facts', name: 'US Forest Service hazardous fuels treatments by NEPA project (FACTS, Enterprise Data Warehouse)', url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_HazardousFuelsTreatments_01/MapServer/0', kind: 'public_record', description: 'US Government work, public domain. Treatments completed since fiscal year 2021, summed per NEPA project; acres count each treatment. Point = center of the treated area. No dollar amounts.' },
  { slug: 'openfema-hma', name: 'OpenFEMA Hazard Mitigation Assistance subapplications, fire hazard (HMGP, HMGP Post Fire, BRIC, PDM)', url: 'https://www.fema.gov/api/open/v2/HmaSubapplications', kind: 'public_record', description: 'US Government work, public domain. Local projects inside state mitigation grants with obligated and paid amounts. Management costs, denied and withdrawn requests left out.' },
  { slug: 'nfpa-firewise', name: 'NFPA Firewise USA sites in good standing, 2024 release (ArcGIS Online)', url: 'https://services1.arcgis.com/0V03GIVRCAoxbtdR/ArcGIS/rest/services/Firewise_sites/FeatureServer/0', kind: 'public_record', description: 'Site names, county, city, point, resident count and total investment as published by NFPA. Every state.' },
  { slug: 'tiger-counties', name: 'US Census Bureau TIGERweb counties (State_County layer 1)', url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1', kind: 'public_record', description: 'US Government work, public domain. Every county in the 50 states, DC and Puerto Rico, outlines generalised to about 200 m.' },
  { slug: 'odf-fuels', name: 'Oregon Department of Forestry fuels treatments (ArcGIS layer ODF_FUELS_ACTIVITIES, updated March 2023)', url: 'https://services1.arcgis.com/CD5mKowwN6nIaqd8/arcgis/rest/services/ODF_FUELS_ACTIVITIES/FeatureServer/0', kind: 'public_record', description: 'Treatments with a recorded status only (Completed, Planned, Initiated); rows marked Unknown are left out. Names are built from treatment type, unit and year; landowner and staff names in the layer are never imported. Point = center of the treated area.' },
  { slug: 'grants-gov', name: 'Grants.gov posted and forecast opportunities: wildfire, fuels, defensible space, prescribed fire, forest restoration', url: 'https://api.grants.gov/v1/api/search2', kind: 'public_record', description: 'Keyword searches: wildfire; hazardous fuels; community wildfire; defensible space; prescribed fire; fire adapted; forest restoration. Research-only calls filtered out by applicant type.' },
  { slug: 'fema-nri', name: 'FEMA National Risk Index, wildfire risk by county', url: 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0', kind: 'public_record', description: 'US Government work, public domain. Modeled estimates: wildfire risk score (national percentile), rating and expected annual loss per county.' },
  { slug: 'hecc-report', name: 'HECC Oregon Conservation Corps Annual Report 2025 (ORS 476.696)', url: 'https://www.oregon.gov/highered/strategy-research/Documents/Legislative-Budget', kind: 'public_record', description: 'Grantee partners and award amounts, page 7. Cumulative January 2022 to June 2025. The report states $11,290,597 awarded; the nine listed awards add to $11,290,224.50.' },
  { slug: 'odf-sfgp', name: 'ODF Small Forestland Grant Program, 2026 summary of awards', url: 'https://www.oregon.gov/odf/programs/sfgp-summary-of-awards-2026.pdf', kind: 'public_record', description: '11 funded projects and 112 applicants by organization. No award amounts published. Contact names in the PDF are not imported.' },
  { slug: 'osfm-cwrr-2023', name: 'OSFM Community Wildfire Risk Reduction Grant recipients (2023)', url: 'https://www.oregon.gov/osfm/Documents/CWRR.Recipients.pdf', kind: 'public_record', description: 'Total grant approved per organization. Year from the OSFM investments page (awards announced May 2023).' },
  { slug: 'osfm-2024-builtenv', name: 'OSFM 2024 CWRR Built Environment grant awardees', url: 'https://www.oregon.gov/osfm/wildfire/Documents/CWRR_Grant_Awardees.pdf', kind: 'public_record', description: 'Award amount per organization, with county.' },
  { slug: 'cwdg-program', name: 'USDA Forest Service Community Wildfire Defense Grant program', url: 'https://www.fs.usda.gov/managing-land/fire/grants/cwdg', kind: 'public_record', description: 'Named as a data source on the SGE proof-of-concept page (June 2026). Publicly available.' },
  { slug: 'projectwildfire', name: 'Project Wildfire, Firewise USA sites in Deschutes County', url: 'https://projectwildfire.org/resources/firewise-usa/', kind: 'website', description: '100 recognized sites, names only. Town areas from the Project Wildfire Firewise storymap as read 2026-11-03.' },
  { slug: 'osfm-investments', name: 'OSFM Investments for Oregon page', url: 'https://www.oregon.gov/osfm/wildfire/pages/investments-for-oregon.aspx', kind: 'website' },
  { slug: 'odf-grants-page', name: 'ODF Grants and incentives page', url: 'https://www.oregon.gov/odf/aboutodf/pages/grantsincentives.aspx', kind: 'website' },
  { slug: 'odf-lrp', name: 'ODF Landscape Resiliency Program page', url: 'https://www.oregon.gov/odf/pages/landscape-resiliency-program.aspx', kind: 'website' },
  { slug: 'deschutes-fall-2026', name: 'Deschutes County 2026 Fall Fuel Reduction Grant Program page', url: 'https://www.deschutescounty.gov/716/2026-Fall-Fuel-Reduction-Grant-Program', kind: 'website' },
  { slug: 'tahoe-lwf', name: 'Tahoe Living With Fire: defensible space software across the Tahoe Basin (Fire Aside)', url: 'https://www.tahoelivingwithfire.com/tft-press-releases/first-of-its-kind-defensible-space-software', kind: 'website' },
  { slug: 'vibrant-planet', name: 'Vibrant Planet website', url: 'https://www.vibrantplanet.net/', kind: 'website' },
  { slug: 'sge-poc', name: 'SGE Oregon Wildfire Opportunity Map, proof of concept (June 2026)', kind: 'website', description: 'Built by Sharing Green Economy, June 2026, from public Oregon state, federal and county sources.' },
  { slug: 'fups', name: 'TruSemble Followups (fups.xlsx)', kind: 'spreadsheet', description: "Private. TruSemble's own fundraising and client pipeline. Imported as unverified.", priv: true },
  { slug: 'kickoff', name: 'TruSemble kickoff meeting notes', kind: 'meeting', description: 'Private. Notes over the kickoff transcript.', priv: true },
  { slug: 'program-catalog', name: 'Funding program pages (each program links to its own page)', kind: 'website', description: 'Each program row links to its own page. Figures are as published; check the program page before applying.' },
];

const BF = ['Upper Mokelumne', 'Upper Wenatchee', 'OrCal Regional Restoration', 'Rogue Valley', 'Upper Butte Creek', 'North Feather', 'SONEC', 'Colfax', 'Butte Fire Safe', 'Plumas Community Protection', 'Yuba Aspen and Meadow', 'Yuba II', 'Yuba I', 'San Diego Canyons'];
export const BLUE_FOREST_SOURCES: SeedSource[] = BF.map((n) => ({
  slug: 'bf-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: `Blue Forest project page: ${n} Forest Resilience Bond`,
  url: `https://www.blueforest.org/our-impact/our-projects/${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`, kind: 'website', description: 'Project facts as stated by Blue Forest. Statuses from the Blue Forest project list.',
}));

const OFFICIAL: [string, string][] = [
  ['100+ Women Who Care Central Oregon', 'https://100wwcco.com'], ['American Forests', 'https://www.americanforests.org/contact-us/'],
  ['Blue Forest', 'https://www.blueforest.org/contact'], ['Brooks Resources Corporation', 'https://brooksresources.com/supporting-our-community/'],
  ['City Forest Credits', 'https://www.cityforestcredits.org'], ['Craft3', 'https://www.craft3.org/contact'],
  ['Deschutes County Natural Resources', 'https://www.deschutes.org/directory'], ['Oregon Community Foundation', 'https://oregoncf.org/about/our-people/staff'],
  ['Meyer Memorial Trust', 'https://mmt.org/contact'], ['The Ford Family Foundation', 'https://www.tfff.org/contact-us'],
  ['The Collins Foundation', 'https://www.collinsfoundation.org'], ['M.J. Murdock Charitable Trust', 'https://murdocktrust.org'],
  ['National Forest Foundation', 'https://www.nationalforests.org/contact-us'], ['Pacific Power Foundation', 'https://www.pacificpower.net/community/foundation.html'],
  ['PGE Foundation', 'https://www.pgefoundation.org/contact-us'], ['Spirit Mountain Community Fund', 'https://www.thecommunityfund.com/contact'],
  ['The Climate Trust', 'https://climatetrust.org/contact/'], ['Finite Carbon', 'https://www.finitecarbon.com/contact/'],
  ['USDA Rural Development', 'https://www.rd.usda.gov/contact-us/state-offices/or'], ['The Roundhouse Foundation', 'https://roundhousefoundation.org/staff/'],
  ['Midstate Electric Cooperative', 'https://www.midstateelectric.coop/community/operation-roundup/'], ['Rotary Club of Greater Bend', 'https://greaterbendrotary.org/grant-application-information/'],
  ['The Bend Foundation', 'https://bendfoundation.org'], ['First Interstate BancSystem Foundation', 'https://www.firstinterstate.bank/company/commitment/grants'],
];
export const OFFICIAL_SOURCES: SeedSource[] = OFFICIAL.map(([n, u]) => ({
  slug: 'official-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: `${n} (official site)`, url: u, kind: 'website', description: 'Contact details as published by the organization for funding inquiries.',
}));

// state, county, fips, lat, lng. Approximate centroids, used for the demo layer only.
export const DEMO_COUNTIES: [string, string, string, number, number][] = [
  ['OR','Deschutes','41017',43.92,-121.23],['OR','Crook','41013',44.16,-120.36],['OR','Jefferson','41031',44.63,-121.18],['OR','Klamath','41035',42.69,-121.65],
  ['OR','Lane','41039',43.94,-122.82],['OR','Jackson','41029',42.43,-122.73],['OR','Josephine','41033',42.37,-123.55],['OR','Douglas','41019',43.28,-123.17],
  ['OR','Wasco','41065',45.16,-121.17],['OR','Hood River','41027',45.51,-121.65],['OR','Union','41061',45.30,-117.96],['OR','Wallowa','41063',45.59,-117.19],
  ['OR','Baker','41001',44.71,-117.52],['OR','Grant','41023',44.50,-118.96],['OR','Harney','41025',43.07,-118.97],['OR','Lake','41037',42.79,-120.38],
  ['OR','Umatilla','41059',45.59,-118.74],['OR','Multnomah','41051',45.55,-122.41],['OR','Clackamas','41005',45.19,-122.18],['OR','Marion','41047',44.90,-122.58],
  ['CA','Butte','06007',39.67,-121.60],['CA','Plumas','06063',40.00,-120.84],['CA','Shasta','06089',40.76,-122.04],['CA','Siskiyou','06093',41.59,-122.54],
  ['CA','Trinity','06105',40.65,-123.11],['CA','Humboldt','06023',40.70,-123.87],['CA','Mendocino','06045',39.44,-123.39],['CA','Lake','06033',39.10,-122.75],
  ['CA','Sonoma','06097',38.53,-122.89],['CA','Napa','06055',38.51,-122.33],['CA','Nevada','06057',39.30,-120.77],['CA','Placer','06061',39.06,-120.72],
  ['CA','El Dorado','06017',38.78,-120.52],['CA','Yuba','06115',39.27,-121.35],['CA','Lassen','06035',40.67,-120.59],['CA','Modoc','06049',41.59,-120.72],
  ['CA','Tehama','06103',40.13,-122.23],['CA','Amador','06005',38.45,-120.65],['CA','Tuolumne','06109',38.03,-119.95],['CA','Fresno','06019',36.76,-119.65],
  ['CA','Kern','06029',35.34,-118.73],['CA','Los Angeles','06037',34.31,-118.23],['CA','San Bernardino','06071',34.84,-116.18],['CA','Riverside','06065',33.74,-115.99],
  ['CA','San Diego','06073',33.03,-116.74],['CA','Santa Barbara','06083',34.67,-120.02],['CA','Ventura','06111',34.46,-119.13],['CA','Alameda','06001',37.65,-121.91],
  ['CA','Contra Costa','06013',37.92,-121.95],['CA','Marin','06041',38.05,-122.75],['CA','Santa Cruz','06087',37.06,-122.01],
  ['WA','Okanogan','53047',48.55,-119.74],['WA','Chelan','53007',47.87,-120.62],['WA','Kittitas','53037',47.12,-120.68],['WA','Yakima','53077',46.46,-120.74],
  ['WA','Klickitat','53039',45.87,-120.78],['WA','Spokane','53063',47.62,-117.40],['WA','Stevens','53065',48.39,-117.85],['WA','Ferry','53019',48.47,-118.52],
  ['ID','Valley','16085',44.76,-115.24],['ID','Idaho','16049',45.84,-115.46],['ID','Boise','16015',43.98,-115.73],['ID','Adams','16003',44.89,-116.45],
  ['ID','Shoshone','16079',47.35,-115.91],['ID','Boundary','16021',48.76,-116.46],['ID','Blaine','16013',43.44,-114.15],['ID','Lemhi','16059',44.93,-113.93],
  ['MT','Flathead','30029',48.30,-114.05],['MT','Missoula','30063',47.03,-113.92],['MT','Ravalli','30081',46.08,-114.20],['MT','Lincoln','30053',48.54,-115.40],
  ['MT','Lewis and Clark','30049',47.12,-112.38],['MT','Gallatin','30031',45.54,-111.17],
  ['CO','Boulder','08013',40.09,-105.35],['CO','Larimer','08069',40.66,-105.46],['CO','Jefferson','08059',39.59,-105.25],['CO','Summit','08117',39.62,-106.11],
  ['CO','Eagle','08037',39.63,-106.69],['CO','Pitkin','08097',39.22,-106.92],['CO','Garfield','08045',39.60,-107.90],['CO','La Plata','08067',37.29,-107.84],
  ['CO','El Paso','08041',38.83,-104.53],['CO','Teller','08119',38.88,-105.17],['CO','Routt','08107',40.48,-106.99],['CO','Grand','08049',40.09,-105.94],
  ['UT','Summit','49043',40.87,-110.96],['UT','Utah','49049',40.12,-111.67],['UT','Wasatch','49051',40.33,-111.17],['UT','Washington','49053',37.28,-113.50],
  ['UT','Iron','49021',37.85,-113.29],['UT','Davis','49011',41.03,-112.11],['UT','Salt Lake','49035',40.67,-111.92],
  ['NM','Santa Fe','35049',35.51,-105.98],['NM','Taos','35055',36.58,-105.63],['NM','Lincoln','35027',33.74,-105.45],['NM','Otero','35035',32.60,-105.77],
  ['NM','Sandoval','35043',35.68,-106.89],['AZ','Coconino','04005',35.83,-111.77],['AZ','Yavapai','04025',34.60,-112.55],['AZ','Gila','04007',33.80,-110.81],
  ['AZ','Navajo','04017',35.40,-110.32],['AZ','Maricopa','04013',33.35,-112.49],['NV','Washoe','32031',40.66,-119.66],['NV','Douglas','32005',38.91,-119.62],
  ['NV','Elko','32007',41.14,-115.35],['WY','Teton','56039',43.93,-110.59],['WY','Sheridan','56033',44.79,-106.88],['WY','Park','56029',44.40,-109.58],
  ['SD','Custer','46033',43.67,-103.45],['NC','Buncombe','37021',35.61,-82.53],['TN','Sevier','47155',35.79,-83.52],['TX','Bastrop','48021',30.10,-97.31],
  ['FL','Volusia','12127',29.06,-81.17],['GA','Fannin','13111',34.86,-84.32],['OK','Cherokee','40021',35.91,-94.99],
];
