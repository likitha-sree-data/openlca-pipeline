import { get, run, tx } from './db';
import { logActivity } from './crud';
import { isRealDate, todayIso } from './format';

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

export type NextStep = { ownerId: number | null; date: string | null; text: string | null };

/** Set who does what by when. Unlike a form edit, an empty value clears the field. */
export function setNextStep(id: number, v: NextStep, userId: number): { ok: true } | { ok: false; error: string } {
  if (v.date !== null && !isRealDate(v.date)) return { ok: false, error: 'Choose a real date.' };
  if (v.text && v.text.length > 300) return { ok: false, error: 'Keep the next step under 300 characters.' };
  if (v.ownerId !== null && !get('SELECT 1 FROM users WHERE id = ?', v.ownerId)) return { ok: false, error: 'That person is not on the team.' };
  if (!get('SELECT 1 FROM requests WHERE id = ?', id)) return { ok: false, error: 'That request no longer exists.' };
  tx(() => {
    run(`UPDATE requests SET owner_id = ?, next_action_date = ?, next_action = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, v.ownerId, v.date, v.text, id);
    const who = v.ownerId ? get<{ name: string }>('SELECT name FROM users WHERE id = ?', v.ownerId)?.name : null;
    logActivity('requests', id, userId, 'edit', `Next step: ${v.text ?? 'none'}${v.date ? `, by ${v.date}` : ''}${who ? `, owner ${who}` : ', no owner'}`);
  });
  return { ok: true };
}

/** Record that the team introduced the two sides. Asks who, so the record of what happened is real. */
export function markIntroduced(id: number, note: string, userId: number, today = todayIso()): { ok: true } | { ok: false; error: string } {
  const n = note.trim();
  if (n.length < 5) return { ok: false, error: 'Say who you introduced to whom, so there is a record.' };
  const r = get<{ status: string; next_action_date: string | null; next_action: string | null }>('SELECT status, next_action_date, next_action FROM requests WHERE id = ?', id);
  if (!r) return { ok: false, error: 'That request no longer exists.' };
  tx(() => {
    run(
      `UPDATE requests SET status = 'intro_made', status_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), closed_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         next_action_date = CASE WHEN next_action_date IS NULL OR next_action_date < ? THEN ? ELSE next_action_date END,
         next_action = CASE WHEN next_action IS NULL OR next_action = '' THEN 'Check how the introduction went' ELSE next_action END WHERE id = ?`,
      today, addDays(today, 7), id,
    );
    logActivity('requests', id, userId, 'status', `Introduction made: ${n.slice(0, 500)}`);
  });
  return { ok: true };
}
