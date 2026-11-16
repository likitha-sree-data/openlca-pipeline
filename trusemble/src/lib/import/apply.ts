import { all, get, run, tx } from '../db';
import { nameKey } from '../text';
import { logActivity, nextRef } from '../crud';
import { resolveOrgByName, userByLabel, type Plan, type PlanItem } from './plan';

export type ApplyResult = { new: number; updated: number; unchanged: number; conflicts: number; invalid: number; orgsCreated: number; contactsCreated: number };

function ensureOrg(name: string | null | undefined, sourceId: number, extra: { state?: string | null; county?: string | null } = {}): { id: number | null; created: boolean } {
  if (!name) return { id: null, created: false };
  const found = resolveOrgByName(name);
  if (found) return { id: found, created: false };
  const { lastId } = run(
    `INSERT INTO organizations (name, name_key, type, state, county, published, verification, source_id) VALUES (?, ?, 'other', ?, ?, 0, 'unverified', ?)`,
    name, nameKey(name), extra.state ?? null, extra.county ?? null, sourceId,
  );
  return { id: lastId, created: true };
}

function ensureContact(name: string | null, email: string | null, phone: string | null, orgId: number | null, sourceId: number, dnc: boolean): { id: number | null; created: boolean } {
  if (!name) return { id: null, created: false };
  const found = (email ? get<{ id: number }>('SELECT id FROM contacts WHERE email = ?', email) : undefined)
    ?? get<{ id: number }>('SELECT id FROM contacts WHERE name_key = ? AND (org_id IS ? OR org_id = ?)', nameKey(name), orgId, orgId);
  if (found) return { id: found.id, created: false };
  const { lastId } = run(
    `INSERT INTO contacts (name, name_key, org_id, email, phone, do_not_contact, verification, source_id) VALUES (?, ?, ?, ?, ?, ?, 'unverified', ?)`,
    name, nameKey(name), orgId, email, phone, dnc ? 1 : 0, sourceId,
  );
  return { id: lastId, created: true };
}

/** Apply a reviewed plan in one transaction. Imported rows are always unverified; clashes with verified rows become issues. */
export function applyPlan(plan: Plan, ctx: { userId: number; importId: number; filename: string }): ApplyResult {
  return tx(() => {
    const src = run(
      `INSERT INTO sources (name, kind, description, is_private, verification, last_fetched_at, assessed) VALUES (?, 'spreadsheet', ?, 1, 'unverified', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1)`,
      ctx.filename, `Uploaded spreadsheet. Imported as unverified.`,
    );
    const sourceId = src.lastId;
    const res: ApplyResult = { new: 0, updated: 0, unchanged: 0, conflicts: 0, invalid: 0, orgsCreated: 0, contactsCreated: 0 };

    for (const it of plan.items) {
      if (it.action === 'invalid') { res.invalid++; continue; }
      if (it.action === 'unchanged') { res.unchanged++; continue; }
      if (it.action === 'new') { insertNew(plan.entity, it, sourceId, ctx, res); res.new++; continue; }
      // updated or conflict
      if (it.changes.length) {
        const sets = it.changes.map((c) => `${c.field} = ?`).join(', ');
        const table = plan.entity;
        run(`UPDATE ${table} SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, ...it.changes.map((c) => c.to), it.matchId!);
        logActivity(table, it.matchId!, ctx.userId, 'imported', `Updated from ${ctx.filename}: ${it.changes.map((c) => c.field).join(', ')}`);
        res.updated++;
      }
      for (const c of it.conflicts) {
        run(
          `INSERT INTO issues (kind, entity, entity_id, field, existing_value, incoming_value, detail, import_id) VALUES ('conflict', ?, ?, ?, ?, ?, ?, ?)`,
          plan.entity, it.matchId!, c.field, String(c.from ?? ''), String(c.to ?? ''), `${ctx.filename} disagrees with a checked record`, ctx.importId,
        );
        res.conflicts++;
      }
    }
    if (plan.entity === 'organizations') scanDuplicates(ctx.importId);
    return res;
  });
}

function insertNew(entity: Plan['entity'], it: PlanItem, sourceId: number, ctx: { userId: number }, res: ApplyResult) {
  const v = it.values;
  switch (entity) {
    case 'organizations': {
      const { lastId } = run(
        `INSERT INTO organizations (name, name_key, type, website, city, county, state, published, verification, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'unverified', ?)`,
        v.name as string, nameKey(String(v.name)), (v.type as string) ?? 'other', v.website as string | null, v.city as string | null, v.county as string | null, v.state as string | null, sourceId,
      );
      logActivity('organizations', lastId, ctx.userId, 'imported', 'Imported from spreadsheet');
      break;
    }
    case 'contacts': {
      const org = ensureOrg(v.organization as string | null, sourceId);
      if (org.created) res.orgsCreated++;
      const { lastId } = run(
        `INSERT INTO contacts (name, name_key, title, org_id, email, phone, decision_role, do_not_contact, verification, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?)`,
        v.name as string, nameKey(String(v.name)), v.title as string | null, org.id, v.email as string | null, v.phone as string | null, v.decision_role as string | null, it.flags.doNotContact ? 1 : 0, sourceId,
      );
      logActivity('contacts', lastId, ctx.userId, 'imported', 'Imported from spreadsheet');
      break;
    }
    case 'projects': {
      const org = ensureOrg(v.organization as string | null, sourceId, { state: v.state as string | null, county: v.county as string | null });
      if (org.created) res.orgsCreated++;
      const { lastId } = run(
        `INSERT INTO projects (name, name_key, owner_org_id, stage, county, state, needs, requested_amount, description, lat, lng, location_precision, published, verification, source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'unverified', ?)`,
        v.name as string, nameKey(String(v.name)), org.id, (v.stage as string) ?? 'planning', v.county as string | null, v.state as string | null, v.needs as string | null,
        v.requested_amount as number | null, v.description as string | null, v.lat as number | null, v.lng as number | null, v.lat != null ? 'area_centre' : null, sourceId,
      );
      logActivity('projects', lastId, ctx.userId, 'imported', 'Imported from spreadsheet');
      break;
    }
    case 'requests': {
      const org = ensureOrg((v.organization as string | null) ?? (v.from_name as string), sourceId);
      if (org.created) res.orgsCreated++;
      const contact = ensureContact(v.contact as string | null, v.email as string | null, v.phone as string | null, org.id, sourceId, !!it.flags.doNotContact);
      if (contact.created) res.contactsCreated++;
      const ownerId = userByLabel(v.owner as string | null);
      const ref = (v.ref as string | null) ?? nextRef();
      const { lastId } = run(
        `INSERT INTO requests (ref, kind, from_name, from_key, org_id, contact_id, status, substatus, priority, amount_text, next_action, next_action_date, owner_id, origin, message, verification, source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, 'unverified', ?)`,
        ref, (v.kind as string) ?? 'fundraising', v.from_name as string, nameKey(String(v.from_name)), org.id, contact.id, (v.status as string) ?? 'new',
        v.substatus as string | null, v.priority as string | null, v.amount_text as string | null, v.next_action as string | null, v.next_action_date as string | null,
        ownerId, v.message as string | null, sourceId,
      );
      logActivity('requests', lastId, ctx.userId, 'imported', 'Imported from spreadsheet');
      break;
    }
  }
}

/** Flag organizations that look like the same place so a person can merge or dismiss them. Idempotent. */
export function scanDuplicates(importId: number | null = null): number {
  const pairs = all<{ a: number; b: number; name: string }>(
    `SELECT o1.id a, o2.id b, o1.name name FROM organizations o1 JOIN organizations o2
       ON o1.name_key = o2.name_key AND o1.id < o2.id
      AND (o1.state IS o2.state OR o1.state IS NULL OR o2.state IS NULL)
      AND (o1.county IS o2.county OR o1.county IS NULL OR o2.county IS NULL)
     WHERE o1.archived = 0 AND o2.archived = 0 AND o1.name_key != ''
       AND NOT EXISTS (SELECT 1 FROM issues i WHERE i.kind = 'duplicate' AND i.entity = 'organizations' AND i.entity_id = o1.id AND i.other_id = o2.id)`,
  );
  for (const p of pairs) {
    run(
      `INSERT INTO issues (kind, entity, entity_id, other_id, detail, import_id) VALUES ('duplicate', 'organizations', ?, ?, ?, ?)`,
      p.a, p.b, `Two organizations named "${p.name}" in the same place`, importId,
    );
  }
  return pairs.length;
}
