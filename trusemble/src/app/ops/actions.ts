'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { get, run, tx } from '@/lib/db';
import { endSession, findUserByLogin, requireUser, startSession } from '@/lib/auth';
import { allow } from '@/lib/rate-limit';
import { callerKey } from '@/lib/http';
import { ENTITIES, entityBySlug, type EntityCfg } from '@/lib/entities';
import { insertRow, logActivity, markUnverified, markVerified, parseFields, setArchived, updateRow, type Values } from '@/lib/crud';
import { generateMatches } from '@/lib/matches';
import { clean } from '@/lib/text';
import { parseUpload, type ParsedFile } from '@/lib/import/parse';
import { guessEntity, guessMapping, IMPORT_FIELDS, KNOWN_LAYOUTS, type ImportEntity } from '@/lib/import/fields';
import { applyPlan, scanDuplicates } from '@/lib/import/apply';
import { buildPlan, type Mapping } from '@/lib/import/plan';
import { isRealDate, todayIso } from '@/lib/format';
import { alertChannels, sendAlert } from '@/lib/notify';
import { markIntroduced, setNextStep } from '@/lib/requests';
import { markLooked, setPublished } from '@/lib/publish';
import { addToOutreach, mergeOrganizations, setContactOwner, setDoNotContact } from '@/lib/people';

export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

// ---------------------------------------------------------------- auth
export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get('email') ?? '').trim();
  const password = String(fd.get('password') ?? '');
  const key = await callerKey();
  // Strict per account (stops guessing one password), loose per address (an office or proxy shares one).
  if (!allow(`login:${key}`, 60, 900) || !allow(`login-email:${email.toLowerCase().slice(0, 200)}`, 10, 900)) return { error: 'Too many attempts. Wait a few minutes and try again.' };
  const user = findUserByLogin(email, password);
  if (!user) return { error: 'That email and password do not match.' };
  await startSession(user.id);
  const next = String(fd.get('next') ?? '');
  redirect(next.startsWith('/ops') && !next.startsWith('//') ? next : '/ops');
}

export async function logoutAction() {
  await endSession();
  redirect('/ops/login');
}

// ---------------------------------------------------------------- generic entities
function cfgOr404(slug: string): EntityCfg {
  const cfg = entityBySlug(slug);
  if (!cfg) throw new Error('Unknown record type');
  return cfg;
}

export async function saveEntity(slug: string, id: number | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const cfg = cfgOr404(slug);
  const parsed = parseFields(cfg.fields, fd);
  if (!parsed.ok) return { error: 'Fix the highlighted fields.', fieldErrors: parsed.errors, values: parsed.values };
  const data: Values = parsed.data;
  if (cfg.key === 'programs' && data.scope === 'state' && !data.state) return { error: 'Choose the state for a statewide program.', fieldErrors: { state: 'Required for statewide programs' }, values: Object.fromEntries(cfg.fields.map((f) => [f.name, String(fd.get(f.name) ?? '')])) };
  if (id === null) {
    const extra: Values = {};
    if (cfg.key === 'requests') extra.origin = 'manual';
    const newId = insertRow(cfg, data, user.id, extra);
    revalidatePath(`/ops/${cfg.slug}`);
    redirect(`/ops/${cfg.slug}/${newId}?created=1`);
  }
  const changed = updateRow(cfg, id, data, user.id);
  revalidatePath(`/ops/${cfg.slug}`);
  return { ok: true, message: changed.length ? 'Saved.' : 'Nothing changed.' };
}

export async function archiveAction(slug: string, id: number, archived: boolean) {
  const user = await requireUser();
  const cfg = cfgOr404(slug);
  setArchived(cfg, id, archived, user.id);
  revalidatePath(`/ops/${cfg.slug}`);
  redirect(`/ops/${cfg.slug}/${id}`);
}

export async function verifyAction(slug: string, id: number, fd: FormData) {
  const user = await requireUser();
  const cfg = cfgOr404(slug);
  const outcome = fd.get('outcome') === 'corrected' ? 'corrected' : 'confirmed';
  markVerified(cfg, id, user.id, outcome, clean(fd.get('note')));
  revalidatePath(`/ops/${cfg.slug}/${id}`);
}

export async function unverifyAction(slug: string, id: number) {
  const user = await requireUser();
  markUnverified(cfgOr404(slug), id, user.id);
  revalidatePath(`/ops/${slug}/${id}`);
}

export async function addNoteAction(slug: string, id: number, fd: FormData) {
  const user = await requireUser();
  const cfg = cfgOr404(slug);
  const body = clean(fd.get('body'));
  if (!body || body.length > 4000) return;
  logActivity(cfg.key, id, user.id, 'note', body);
  revalidatePath(`/ops/${cfg.slug}/${id}`);
}

/** Board moves and quick status changes. */
export async function moveAction(slug: string, id: number, fd: FormData) {
  const user = await requireUser();
  const cfg = cfgOr404(slug);
  const field = cfg.key === 'requests' ? 'status' : cfg.key === 'projects' ? 'stage' : null;
  if (!field) return;
  const value = String(fd.get('to') ?? '');
  const spec = cfg.fields.find((f) => f.name === field);
  if (!spec?.options?.some((o) => o[0] === value)) return;
  const row = get<Values>(`SELECT * FROM ${cfg.table} WHERE id = ?`, id);
  if (!row) return;
  updateRow(cfg, id, { ...pick(row, cfg.fields.map((f) => f.name)), [field]: value }, user.id);
  revalidatePath(`/ops/${cfg.slug}`);
}
const pick = (o: Values, keys: string[]): Values => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

/** Triage: give a request an owner and a next action date. */
export async function scheduleAction(id: number, fd: FormData) {
  const user = await requireUser();
  const owner = /^\d+$/.test(String(fd.get('owner_id') ?? '')) ? Number(fd.get('owner_id')) : null;
  const date = isRealDate(String(fd.get('next_action_date') ?? '')) ? String(fd.get('next_action_date')) : null;
  const action = clean(fd.get('next_action'));
  if (!owner && !date && !action) return;
  run(
    `UPDATE requests SET owner_id = COALESCE(?, owner_id), next_action_date = COALESCE(?, next_action_date), next_action = COALESCE(?, next_action), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    owner, date, action, id,
  );
  logActivity('requests', id, user.id, 'edit', `Scheduled${owner ? ' with an owner' : ''}${date ? ` for ${date}` : ''}`);
  revalidatePath('/ops/requests');
  revalidatePath('/ops');
}

// ---------------------------------------------------------------- matches
export async function generateMatchesAction() {
  await requireUser();
  generateMatches(todayIso());
  revalidatePath('/ops/matches');
}

export async function decideMatchAction(id: number, status: 'accepted' | 'dismissed' | 'suggested') {
  const user = await requireUser();
  run(`UPDATE matches SET status = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, status, status === 'suggested' ? null : user.id, id);
  const m = get<{ project_id: number; program_id: number }>('SELECT project_id, program_id FROM matches WHERE id = ?', id);
  if (m && status !== 'suggested') logActivity('projects', m.project_id, user.id, 'edit', `Match with program ${m.program_id} ${status}`);
  revalidatePath('/ops/matches');
}

// ---------------------------------------------------------------- data quality
export async function resolveIssueAction(id: number, fd: FormData) {
  const user = await requireUser();
  const act = String(fd.get('action'));
  const issue = get<{ kind: string; entity: string; entity_id: number; field: string | null; incoming_value: string | null }>('SELECT * FROM issues WHERE id = ?', id);
  if (!issue) return;
  tx(() => {
    if (act === 'use_incoming' && issue.kind === 'conflict' && issue.field && /^[a-z_]+$/.test(issue.field) && entityBySlug(issue.entity)) {
      const cfg = entityBySlug(issue.entity)!;
      run(`UPDATE ${cfg.table} SET ${issue.field} = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, issue.incoming_value, issue.entity_id);
      logActivity(cfg.key, issue.entity_id, user.id, 'edit', `Took the imported ${issue.field}`);
    }
    run(`UPDATE issues SET status = ?, resolved_by = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, act === 'dismiss' ? 'dismissed' : 'resolved', user.id, id);
  });
  revalidatePath('/ops/data-quality');
}

export async function scanDuplicatesAction() {
  await requireUser();
  scanDuplicates(null);
  revalidatePath('/ops/data-quality');
}

// ---------------------------------------------------------------- imports
const UPLOAD_DIR = () => path.join(path.dirname(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'x.db')), 'uploads');

export async function uploadImportAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a CSV or Excel file first.' };
  let parsed: ParsedFile;
  const bytes = Buffer.from(await file.arrayBuffer());
  try { parsed = await parseUpload(file.name, bytes); } catch (e) { return { error: e instanceof Error ? e.message : 'The file could not be read.' }; }
  const dir = UPLOAD_DIR();
  fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, `${randomUUID()}${path.extname(file.name).toLowerCase()}`);
  fs.writeFileSync(stored, bytes, { mode: 0o600 });
  const names = parsed.sheets.map((s) => s.name);
  const entity = guessEntity(names, parsed.sheets.map((s) => s.headers));
  const mapping: Mapping = { entity, sheets: Object.fromEntries(parsed.sheets.map((s) => [s.name, { include: s.rows.length > 0, columns: guessMapping(entity, s.headers) }])) };
  const known = KNOWN_LAYOUTS.find((k) => k.test(names));
  const { lastId } = run(
    `INSERT INTO imports (filename, stored_path, format, sheets, entity, mapping, status, user_id) VALUES (?, ?, ?, ?, ?, ?, 'uploaded', ?)`,
    file.name.slice(0, 200), stored, known?.label ?? (parsed.format === 'csv' ? 'CSV' : 'Excel workbook'), JSON.stringify(names), entity, JSON.stringify(mapping), user.id,
  );
  redirect(`/ops/imports/${lastId}`);
}

async function loadParsed(importId: number): Promise<{ row: { id: number; stored_path: string; filename: string; status: string }; parsed: ParsedFile }> {
  const row = get<{ id: number; stored_path: string; filename: string; status: string }>('SELECT id, stored_path, filename, status FROM imports WHERE id = ?', importId);
  if (!row?.stored_path || !fs.existsSync(row.stored_path)) throw new Error('The uploaded file is no longer available. Upload it again.');
  const parsed = await parseUpload(row.filename, fs.readFileSync(row.stored_path));
  return { row, parsed };
}

export async function saveMappingAction(importId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const { parsed } = await loadParsed(importId);
  const entity = String(fd.get('entity')) as ImportEntity;
  if (!(entity in IMPORT_FIELDS)) return { error: 'Choose what these rows are.' };
  const valid = new Set(IMPORT_FIELDS[entity].map((f) => f.name));
  const mapping: Mapping = { entity, sheets: {} };
  for (const [si, s] of parsed.sheets.entries()) {
    const columns: Record<string, string> = {};
    for (const [hi, h] of s.headers.entries()) {
      const v = String(fd.get(`map-${si}-${hi}`) ?? '');
      columns[h] = valid.has(v) ? v : '';
    }
    mapping.sheets[s.name] = { include: fd.get(`include-${si}`) === 'on', columns };
    const used = Object.values(columns).filter(Boolean);
    if (mapping.sheets[s.name].include && new Set(used).size !== used.length) return { error: `Sheet "${s.name}" maps two columns to the same field.` };
  }
  const required = IMPORT_FIELDS[entity].filter((f) => f.required).map((f) => f.name);
  for (const s of parsed.sheets) {
    const m = mapping.sheets[s.name];
    if (m.include && !required.every((r) => Object.values(m.columns).includes(r))) return { error: `Sheet "${s.name}" needs a column for ${IMPORT_FIELDS[entity].filter((f) => f.required).map((f) => f.label).join(', ')}.` };
  }
  if (!Object.values(mapping.sheets).some((m) => m.include)) return { error: 'Include at least one sheet.' };
  run(`UPDATE imports SET entity = ?, mapping = ?, status = 'mapped' WHERE id = ?`, entity, JSON.stringify(mapping), importId);
  redirect(`/ops/imports/${importId}?step=review`);
}

export async function applyImportAction(importId: number) {
  const user = await requireUser();
  const { row, parsed } = await loadParsed(importId);
  if (row.status === 'applied') redirect(`/ops/imports/${importId}`);
  const rec = get<{ entity: ImportEntity; mapping: string }>('SELECT entity, mapping FROM imports WHERE id = ?', importId)!;
  const mapping = JSON.parse(rec.mapping) as Mapping;
  const plan = buildPlan(rec.entity, parsed.sheets, mapping);
  try {
    const result = applyPlan(plan, { userId: user.id, importId, filename: row.filename });
    run(`UPDATE imports SET status = 'applied', result = ?, problems = ?, applied_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, JSON.stringify(result), JSON.stringify(plan.items.filter((i) => i.action === 'invalid' || i.problem).slice(0, 50).map((i) => `${i.sheet} row ${i.row}: ${i.problem}`)), importId);
  } catch (e) {
    run(`UPDATE imports SET status = 'failed', problems = ? WHERE id = ?`, JSON.stringify([e instanceof Error ? e.message : 'Import failed']), importId);
  }
  revalidatePath('/ops/imports');
  redirect(`/ops/imports/${importId}`);
}

export async function discardImportAction(importId: number) {
  await requireUser();
  const row = get<{ stored_path: string | null; status: string }>('SELECT stored_path, status FROM imports WHERE id = ?', importId);
  if (row && row.status !== 'applied') {
    if (row.stored_path) fs.rmSync(row.stored_path, { force: true });
    run('DELETE FROM imports WHERE id = ?', importId);
  }
  redirect('/ops/imports');
}

// ---------------------------------------------------------------- sources
export async function saveSourceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const name = clean(fd.get('name'));
  const url = clean(fd.get('url'));
  if (!name) return { error: 'Name the source.' };
  if (url && !/^https?:\/\//i.test(url)) return { error: 'The link must start with http:// or https://.' };
  const kind = ['public_record', 'website', 'spreadsheet', 'meeting'].includes(String(fd.get('kind'))) ? String(fd.get('kind')) : 'website';
  run(`INSERT INTO sources (name, url, kind, description, is_private) VALUES (?, ?, ?, ?, ?)`, name, url, kind, clean(fd.get('description')), fd.get('is_private') === 'on' ? 1 : 0);
  revalidatePath('/ops/sources');
  return { ok: true, message: 'Source added.' };
}

export async function toggleAssessedAction(id: number) {
  await requireUser();
  run('UPDATE sources SET assessed = 1 - assessed WHERE id = ?', id);
  revalidatePath('/ops/sources');
}

// ---------------------------------------------------------------- calculator benchmarks
export async function saveBenchmarkAction(id: number | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const name = clean(fd.get('name'));
  const cost = Number(String(fd.get('cost_per_acre') ?? '').replace(/[$,]/g, ''));
  const url = clean(fd.get('source_url'));
  if (!name) return { error: 'Name the program.' };
  if (!Number.isFinite(cost) || cost <= 0 || cost > 1_000_000) return { error: 'Cost per acre must be a positive number.' };
  if (url && !/^https?:\/\//i.test(url)) return { error: 'The link must start with http:// or https://.' };
  const verification = fd.get('verified') === 'on' ? 'verified' : 'unverified';
  if (id) run('UPDATE calculator_benchmarks SET name = ?, cost_per_acre = ?, source_url = ?, note = ?, verification = ? WHERE id = ?', name, cost, url, clean(fd.get('note')), verification, id);
  else run('INSERT INTO calculator_benchmarks (name, cost_per_acre, source_url, note, verification, sort) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort),0)+1 FROM calculator_benchmarks))', name, cost, url, clean(fd.get('note')), verification);
  revalidatePath('/ops/calculator');
  revalidatePath('/calculator');
  return { ok: true, message: 'Saved.' };
}

export async function deleteBenchmarkAction(id: number) {
  await requireUser();
  run('DELETE FROM calculator_benchmarks WHERE id = ?', id);
  revalidatePath('/ops/calculator');
  revalidatePath('/calculator');
}

// ---------------------------------------------------------------- pilot
export async function pilotAcceptAction(userId: number, accept: boolean) {
  const user = await requireUser();
  if (user.id !== userId) return; // only the person can accept or decline their own lane
  run('UPDATE pilot_members SET status = ? WHERE user_id = ?', accept ? 'accepted' : 'declined', userId);
  revalidatePath('/ops/pilot');
}

export async function pilotCapacityAction(userId: number, fd: FormData) {
  await requireUser();
  const h = Number(fd.get('capacity'));
  run('UPDATE pilot_members SET capacity_hours = ? WHERE user_id = ?', Number.isFinite(h) && h > 0 && h <= 80 ? h : null, userId);
  revalidatePath('/ops/pilot');
}

export async function pilotAddPersonAction(fd: FormData) {
  const user = await requireUser();
  const contactId = Number(fd.get('contact_id'));
  if (!Number.isInteger(contactId) || !get('SELECT 1 FROM contacts WHERE id = ?', contactId)) return;
  run('INSERT OR IGNORE INTO pilot_people (contact_id, added_by) VALUES (?, ?)', contactId, user.id);
  revalidatePath('/ops/pilot');
}

const STEPS = { qualified: 'qualified_at', contacted: 'contacted_at', followup: 'followup_at', replied: 'replied_at', meeting: 'meeting_at' } as const;
export async function pilotAdvanceAction(id: number, step: keyof typeof STEPS) {
  await requireUser();
  const col = STEPS[step];
  if (!col) return;
  run(`UPDATE pilot_people SET ${col} = COALESCE(${col}, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?`, id);
  revalidatePath('/ops/pilot');
}

export async function pilotRemovePersonAction(id: number) {
  await requireUser();
  run('DELETE FROM pilot_people WHERE id = ?', id);
  revalidatePath('/ops/pilot');
}

export async function pilotReviewAction(fd: FormData) {
  const user = await requireUser();
  const slug = String(fd.get('slug'));
  const cfg = entityBySlug(slug);
  const id = Number(fd.get('id'));
  if (!cfg || !Number.isInteger(id) || !get(`SELECT 1 FROM ${cfg.table} WHERE id = ?`, id)) return;
  markVerified(cfg, id, user.id, fd.get('outcome') === 'corrected' ? 'corrected' : 'confirmed', clean(fd.get('note')));
  revalidatePath('/ops/pilot');
}

export async function pilotBriefAction(fd: FormData) {
  const user = await requireUser();
  const title = clean(fd.get('title'));
  if (!title) return;
  const ref = (k: string) => (/^\d+$/.test(String(fd.get(k) ?? '')) ? Number(fd.get(k)) : null);
  run(
    `INSERT INTO briefs (author_id, title, project_id, program_id, evidence, gaps, next_step, next_owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id, title, ref('project_id'), ref('program_id'), clean(fd.get('evidence')), clean(fd.get('gaps')), clean(fd.get('next_step')), ref('next_owner_id'),
  );
  revalidatePath('/ops/pilot');
}

export async function pilotAskAction(fd: FormData) {
  const user = await requireUser();
  const stakeholder = clean(fd.get('stakeholder'));
  if (!stakeholder) return;
  run(`INSERT INTO validation_asks (user_id, stakeholder, entity, entity_id) VALUES (?, ?, ?, ?)`, user.id, stakeholder, clean(fd.get('entity')), /^\d+$/.test(String(fd.get('entity_id') ?? '')) ? Number(fd.get('entity_id')) : null);
  revalidatePath('/ops/pilot');
}

export async function pilotConfirmAskAction(id: number, fd: FormData) {
  await requireUser();
  run(`UPDATE validation_asks SET confirmed_at = COALESCE(confirmed_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), response = ? WHERE id = ?`, clean(fd.get('response')), id);
  revalidatePath('/ops/pilot');
}

export async function pilotDemoAction(fd: FormData) {
  const user = await requireUser();
  const ref = (k: string) => (/^\d+$/.test(String(fd.get(k) ?? '')) ? Number(fd.get(k)) : null);
  const projectId = ref('project_id');
  const programId = ref('program_id');
  const missing = clean(fd.get('missing'));
  const nextStep = clean(fd.get('next_step'));
  const owner = ref('next_owner_id');
  if (!projectId || !programId || !missing || !nextStep || !owner) return; // the checklist is only complete when every part is filled
  run(`INSERT INTO workflow_demos (user_id, project_id, program_id, missing, next_step, next_owner_id, attachment_url) VALUES (?, ?, ?, ?, ?, ?, ?)`, user.id, projectId, programId, missing, nextStep, owner, clean(fd.get('attachment_url')));
  revalidatePath('/ops/pilot');
}

export async function pilotNotesAction(fd: FormData) {
  await requireUser();
  run('UPDATE pilot SET review_notes = ? WHERE id = 1', clean(fd.get('notes')));
  revalidatePath('/ops/pilot');
}

export async function lookupName(slug: string, id: number) {
  const cfg = ENTITIES[(entityBySlug(slug)?.key ?? 'organizations')];
  return get<{ n: string }>(`SELECT ${cfg.titleCol} n FROM ${cfg.table} WHERE id = ?`, id)?.n ?? null;
}

// ---------------------------------------------------------------- check the data
export async function checkRecordAction(fd: FormData) {
  const user = await requireUser();
  const slug = String(fd.get('slug'));
  const cfg = entityBySlug(slug);
  const id = Number(fd.get('id'));
  if (!cfg || !['funding', 'projects', 'organizations'].includes(slug) || !Number.isInteger(id) || !get(`SELECT 1 FROM ${cfg.table} WHERE id = ?`, id)) redirect('/ops/check');
  markVerified(cfg, id, user.id, fd.get('outcome') === 'corrected' ? 'corrected' : 'confirmed', clean(fd.get('note')));
  revalidatePath('/ops/check');
  revalidatePath('/ops');
  redirect('/ops/check');
}

// ---------------------------------------------------------------- alerts
export async function sendTestAlertAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const ch = alertChannels();
  if (!ch.webhook && !ch.email) return { error: 'No alerts are set up yet. Follow the steps below, then try again.' };
  const r = await sendAlert({ title: 'Test alert from TruSemble', lines: [`${user.name} sent this to check that alerts reach you.`], path: '/ops' });
  if (r.failed.length) return { error: `Could not send by ${r.failed.join(' and ')}. Check the settings below.` };
  return { ok: true, message: `Sent by ${r.sent.join(' and ')}.` };
}

// ---------------------------------------------------------------- one request
export async function nextStepAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const owner = /^\d+$/.test(String(fd.get('owner_id') ?? '')) ? Number(fd.get('owner_id')) : null;
  const date = clean(fd.get('next_action_date'));
  const r = setNextStep(id, { ownerId: owner, date, text: clean(fd.get('next_action')) }, user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/ops/requests/${id}`);
  revalidatePath('/ops');
  return { ok: true, message: 'Saved.' };
}

export async function introducedAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const r = markIntroduced(id, String(fd.get('note') ?? ''), user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/ops/requests/${id}`);
  revalidatePath('/ops');
  return { ok: true, message: 'Introduction recorded. A follow-up is set for next week.' };
}

// ---------------------------------------------------------------- show or hide on the website
export async function publishAction(table: 'projects' | 'programs' | 'organizations', id: number, show: boolean, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (table !== 'projects' && table !== 'programs' && table !== 'organizations') return { error: 'Unknown record type.' };
  const r = setPublished(table, id, show, user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/ops/${table === 'programs' ? 'funding' : table}/${id}`);
  revalidatePath('/ops');
  return { ok: true, message: show ? 'It is now on the website.' : 'It is hidden from the website.' };
}

export async function lookedAction(id: number) {
  const user = await requireUser();
  markLooked(id, user.id);
  revalidatePath(`/ops/funding/${id}`);
}

// ---------------------------------------------------------------- people and groups
export async function mergeOrganizationAction(intoId: number, fromId: number, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const r = mergeOrganizations(fromId, intoId, user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath('/ops/data-quality');
  redirect(`/ops/organizations/${intoId}?notice=${encodeURIComponent(`Merged. Moved ${r.moved.projects} projects, ${r.moved.people} people and ${r.moved.requests} requests into this group.`)}`);
}

export async function doNotContactAction(contactId: number, flag: boolean, fd: FormData) {
  const user = await requireUser();
  setDoNotContact(contactId, flag, clean(fd.get('reason')), user.id);
  revalidatePath(`/ops/contacts/${contactId}`);
}

export async function outreachAction(contactId: number, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const r = addToOutreach(contactId, user.id);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/ops/contacts/${contactId}`);
  revalidatePath('/ops/pilot');
  return { ok: true, message: 'Added to the outreach list.' };
}

export async function contactOwnerAction(contactId: number, fd: FormData) {
  const user = await requireUser();
  const owner = /^\d+$/.test(String(fd.get('owner_id') ?? '')) ? Number(fd.get('owner_id')) : null;
  setContactOwner(contactId, owner, user.id);
  revalidatePath(`/ops/contacts/${contactId}`);
}
