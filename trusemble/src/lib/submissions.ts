import { get, run, tx } from './db';
import { nameKey } from './text';
import { insertRow, logActivity, nextRef } from './crud';
import { ENTITIES } from './crud';

export type Person = { name: string; email: string; phone?: string | null; org?: string | null; role?: string | null };

function upsertOrg(name: string | null | undefined, type = 'other'): number | null {
  if (!name) return null;
  const key = nameKey(name);
  const hit = get<{ id: number }>('SELECT id FROM organizations WHERE name_key = ? ORDER BY id LIMIT 1', key);
  if (hit) return hit.id;
  return run(`INSERT INTO organizations (name, name_key, type, published, verification) VALUES (?, ?, ?, 0, 'unverified')`, name, key, type).lastId;
}

function upsertContact(p: Person, orgId: number | null): number {
  const hit = get<{ id: number }>('SELECT id FROM contacts WHERE email = ?', p.email.toLowerCase());
  if (hit) return hit.id;
  return run(
    `INSERT INTO contacts (name, name_key, title, org_id, email, phone, verification) VALUES (?, ?, ?, ?, ?, ?, 'unverified')`,
    p.name, nameKey(p.name), p.role ?? null, orgId, p.email.toLowerCase(), p.phone ?? null,
  ).lastId;
}

function newRequest(kind: string, from: string, orgId: number | null, contactId: number | null, projectId: number | null, message: string | null, payload: unknown, amountText: string | null = null): { id: number; ref: string } {
  const cfg = ENTITIES.requests;
  const ref = nextRef();
  const id = insertRow(
    cfg,
    { from_name: from, kind, status: 'new', substatus: null, priority: null, amount_text: amountText, org_id: orgId, contact_id: contactId, project_id: projectId, message },
    null,
    { ref, origin: 'public_form', payload: JSON.stringify(payload), verification: 'unverified' },
  );
  return { id, ref };
}

export type FundingRequestInput = {
  person: Person;
  existingProjectId?: number | null;
  projectName: string;
  description: string;
  state?: string | null;
  county?: string | null;
  category: string;
  orgType?: string | null;
  needs: string[];
  amount?: number | null;
  homes?: number | null;
  timeline?: string | null;
};

/** Public "Request funding" form. Nothing it creates is published; a person reads every request. */
export function createFundingRequest(i: FundingRequestInput): { ref: string } {
  return tx(() => {
    const orgId = upsertOrg(i.person.org, i.orgType ?? 'other');
    const contactId = upsertContact(i.person, orgId);
    let projectId = i.existingProjectId ?? null;
    if (projectId && !get('SELECT 1 FROM projects WHERE id = ? AND published = 1 AND archived = 0', projectId)) projectId = null;
    if (!projectId) {
      projectId = run(
        `INSERT INTO projects (name, name_key, owner_org_id, stage, category, description, county, state, needs, requested_amount, published, verification)
         VALUES (?, ?, ?, 'seeking_funding', ?, ?, ?, ?, ?, ?, 0, 'unverified')`,
        i.projectName, nameKey(i.projectName), orgId, i.category, i.description, i.county ?? null, i.state ?? null, i.needs.join(', ') || null, i.amount ?? null,
      ).lastId;
      logActivity('projects', projectId, null, 'created', 'Created from a public funding request (not published)');
    }
    const amountText = i.amount ? `$${Math.round(i.amount).toLocaleString('en-US')}` : null;
    const r = newRequest('funding_request', i.person.org || i.person.name, orgId, contactId, projectId, i.description, {
      needs: i.needs, homes: i.homes ?? null, timeline: i.timeline ?? null, state: i.state ?? null, county: i.county ?? null, category: i.category,
    }, amountText);
    return { ref: r.ref };
  });
}

export function createProjectSubmission(i: { person: Person; projectName: string; description: string; state?: string | null; county?: string | null; category: string; sourceUrl?: string | null }): { ref: string } {
  return tx(() => {
    const orgId = upsertOrg(i.person.org);
    const contactId = upsertContact(i.person, orgId);
    const projectId = run(
      `INSERT INTO projects (name, name_key, owner_org_id, stage, category, description, county, state, source_url, published, verification)
       VALUES (?, ?, ?, 'planning', ?, ?, ?, ?, ?, 0, 'unverified')`,
      i.projectName, nameKey(i.projectName), orgId, i.category, i.description, i.county ?? null, i.state ?? null, i.sourceUrl ?? null,
    ).lastId;
    logActivity('projects', projectId, null, 'created', 'Submitted through the public form (not published)');
    const r = newRequest('project_submission', i.person.org || i.person.name, orgId, contactId, projectId, i.description, { state: i.state ?? null, county: i.county ?? null });
    return { ref: r.ref };
  });
}

export function createInquiry(i: { person: Person; topic: string; message: string }): { ref: string } {
  return tx(() => {
    const orgId = upsertOrg(i.person.org);
    const contactId = upsertContact(i.person, orgId);
    const r = newRequest('inquiry', i.person.org || i.person.name, orgId, contactId, null, `${i.topic}: ${i.message}`, { topic: i.topic });
    return { ref: r.ref };
  });
}

export function createIntroductionRequest(i: { person: Person; projectId: number; side: string; message: string }): { ref: string } {
  return tx(() => {
    const project = get<{ id: number; name: string }>('SELECT id, name FROM projects WHERE id = ? AND published = 1 AND archived = 0', i.projectId);
    if (!project) throw new Error('That project is not available.');
    const orgId = upsertOrg(i.person.org);
    const contactId = upsertContact(i.person, orgId);
    const r = newRequest('introduction', i.person.org || i.person.name, orgId, contactId, project.id, `${i.side} asking to be introduced to ${project.name}. ${i.message}`, { side: i.side });
    return { ref: r.ref };
  });
}
