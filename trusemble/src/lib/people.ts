import { all, get, run, tx } from './db';
import { logActivity } from './crud';

export type Dup = { id: number; name: string; county: string | null; state: string | null; website: string | null; projects: number; people: number; requests: number };

/** Other active groups with the same name (ignoring "Inc", "the", punctuation) in a place that could be the same: a different state or county means a different group. */
export async function findDuplicates(orgId: number): Promise<Dup[]> {
  return await all<Dup>(
    `SELECT o2.id, o2.name, o2.county, o2.state, o2.website,
       (SELECT COUNT(*) FROM projects WHERE owner_org_id = o2.id AND archived = 0) projects,
       (SELECT COUNT(*) FROM contacts WHERE org_id = o2.id AND archived = 0) people,
       (SELECT COUNT(*) FROM requests WHERE org_id = o2.id AND archived = 0) requests
     FROM organizations o1 JOIN organizations o2 ON o2.name_key = o1.name_key AND o2.id != o1.id
      AND (o1.state IS NOT DISTINCT FROM o2.state OR o1.state IS NULL OR o2.state IS NULL)
      AND (o1.county IS NOT DISTINCT FROM o2.county OR o1.county IS NULL OR o2.county IS NULL)
     WHERE o1.id = ? AND o1.name_key != '' AND o2.archived = 0 ORDER BY o2.id`, orgId,
  );
}

export type MergeResult = { ok: true; moved: { projects: number; people: number; requests: number; awards: number; programs: number } } | { ok: false; error: string };

/**
 * Fold one group into another so nobody is listed twice. Everything attached to `from` moves to `into`;
 * blanks on `into` are filled from `from`; `from` is archived (not deleted) with a note saying where it went.
 */
export async function mergeOrganizations(fromId: number, intoId: number, userId: number): Promise<MergeResult> {
  if (fromId === intoId) return { ok: false, error: 'Pick two different groups.' };
  const from = await get<Record<string, unknown> & { id: number; name: string }>('SELECT * FROM organizations WHERE id = ?', fromId);
  const into = await get<Record<string, unknown> & { id: number; name: string }>('SELECT * FROM organizations WHERE id = ?', intoId);
  if (!from || !into) return { ok: false, error: 'One of those groups no longer exists.' };
  if (into.archived) return { ok: false, error: 'The group you are keeping is archived. Restore it first.' };
  const moved = await tx(async () => {
    const m = {
      projects: (await run('UPDATE projects SET owner_org_id = ? WHERE owner_org_id = ?', intoId, fromId)).changes,
      people: (await run('UPDATE contacts SET org_id = ? WHERE org_id = ?', intoId, fromId)).changes,
      requests: (await run('UPDATE requests SET org_id = ? WHERE org_id = ?', intoId, fromId)).changes,
      awards: (await run('UPDATE awards SET org_id = ? WHERE org_id = ?', intoId, fromId)).changes,
      programs: (await run('UPDATE programs SET run_by_org_id = ? WHERE run_by_org_id = ?', intoId, fromId)).changes,
    };
    // fill only what the kept group is missing; never overwrite
    const fill: string[] = [];
    for (const col of ['website', 'city', 'county', 'state', 'lat', 'lng', 'location_precision', 'source_id']) {
      if ((into[col] === null || into[col] === '') && from[col] !== null && from[col] !== '') { fill.push(col); }
    }
    if (into.type === 'other' && from.type && from.type !== 'other') fill.push('type');
    if (fill.length) await run(`UPDATE organizations SET ${fill.map((c) => `${c} = ?`).join(', ')}, updated_at = now_iso() WHERE id = ?`, ...fill.map((c) => from[c] as string | number | null), intoId);
    await run(`UPDATE activities SET entity_id = ? WHERE entity = 'organizations' AND entity_id = ?`, intoId, fromId);
    await run(
      `UPDATE organizations SET archived = 1, published = 0, notes = trim(COALESCE(notes, '') || chr(10) || ?), updated_at = now_iso() WHERE id = ?`,
      `Merged into "${into.name}" (#${intoId}).`, fromId,
    );
    await run(`UPDATE issues SET status = 'resolved', resolved_by = ?, resolved_at = now_iso() WHERE status = 'open' AND kind = 'duplicate' AND entity = 'organizations' AND (entity_id IN (?, ?) OR other_id IN (?, ?))`, userId, fromId, intoId, fromId, intoId);
    await logActivity('organizations', intoId, userId, 'edit', `Merged "${from.name}" into this group: ${m.projects} projects, ${m.people} people, ${m.requests} requests moved${fill.length ? `; filled in ${fill.join(', ')}` : ''}`);
    return m;
  });
  return { ok: true, moved };
}

/** Stop the team contacting someone, or allow it again. Always leaves a record. */
export async function setDoNotContact(contactId: number, flag: boolean, reason: string | null, userId: number): Promise<boolean> {
  if (!await get('SELECT 1 FROM contacts WHERE id = ?', contactId)) return false;
  await tx(async () => {
    await run(`UPDATE contacts SET do_not_contact = ?, updated_at = now_iso() WHERE id = ?`, flag ? 1 : 0, contactId);
    if (flag) await run('DELETE FROM pilot_people WHERE contact_id = ? AND contacted_at IS NULL', contactId); // never leave them queued for outreach
    await logActivity('contacts', contactId, userId, 'edit', flag ? `Marked do not contact${reason ? `: ${reason}` : ''}` : 'OK to contact again');
  });
  return true;
}

/** Put a contact on the outreach list (pilot). Refuses people marked do not contact. */
export async function addToOutreach(contactId: number, userId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await get<{ do_not_contact: number }>('SELECT do_not_contact FROM contacts WHERE id = ?', contactId);
  if (!c) return { ok: false, error: 'That contact no longer exists.' };
  if (c.do_not_contact) return { ok: false, error: 'This person is marked do not contact.' };
  await run('INSERT INTO pilot_people (contact_id, added_by) VALUES (?, ?) ON CONFLICT DO NOTHING', contactId, userId);
  await logActivity('contacts', contactId, userId, 'edit', 'Added to the outreach list');
  return { ok: true };
}

export async function setContactOwner(contactId: number, ownerId: number | null, userId: number): Promise<boolean> {
  if (!await get('SELECT 1 FROM contacts WHERE id = ?', contactId)) return false;
  if (ownerId !== null && !await get('SELECT 1 FROM users WHERE id = ?', ownerId)) return false;
  await run(`UPDATE contacts SET owner_id = ?, updated_at = now_iso() WHERE id = ?`, ownerId, contactId);
  const who = ownerId ? (await get<{ name: string }>('SELECT name FROM users WHERE id = ?', ownerId))?.name : null;
  await logActivity('contacts', contactId, userId, 'edit', who ? `${who} is now the team contact for this person` : 'No team member owns this contact now');
  return true;
}
