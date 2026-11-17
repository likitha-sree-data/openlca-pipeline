import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { all, get } from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { DECISION_ROLES, label } from '@/lib/constants';
import { StatusPill } from '@/components/ops/ui';
import { contactOwnerAction, doNotContactAction } from '@/app/ops/actions';
import { CheckCard, HistoryCard } from './RecordParts';
import { OutreachForm } from './MergeForm';

type Row = Record<string, string | number | null>;

/** One person: who they are, how to reach them, what we have talked about, and who on the team knows them. */
export async function ContactView({ id, row, users }: { id: number; row: Row; users: [string, string][] }) {
  const org = row.org_id ? await get<{ id: number; name: string }>('SELECT id, name FROM organizations WHERE id = ?', Number(row.org_id)) : undefined;
  const requests = await all<{ id: number; ref: string; from_name: string; status: string; received_at: string }>('SELECT id, ref, from_name, status, received_at FROM requests WHERE contact_id = ? ORDER BY id DESC LIMIT 8', id);
  const outreach = await get<{ id: number; qualified_at: string | null; contacted_at: string | null; followup_at: string | null; replied_at: string | null; meeting_at: string | null; who: string | null }>(
    'SELECT p.*, u.name who FROM pilot_people p LEFT JOIN users u ON u.id = p.added_by WHERE p.contact_id = ?', id);
  const dncNote = row.do_not_contact ? (await get<{ body: string }>(`SELECT body FROM activities WHERE entity = 'contacts' AND entity_id = ? AND body ILIKE 'Marked do not contact%' ORDER BY id DESC LIMIT 1`, id))?.body : null;
  const dnc = !!row.do_not_contact;
  const email = row.email ? String(row.email) : null;
  const phone = row.phone ? String(row.phone) : null;

  return (
    <div className="detail-grid" style={{ marginTop: 4 }}>
      <div className="stack">
        <section className="card" style={{ marginTop: 0 }} aria-labelledby="who">
          <h2 id="who">Who they are</h2>
          <dl className="kv-list" style={{ gridTemplateColumns: '170px 1fr', marginTop: 10 }}>
            <dt>Title</dt><dd>{row.title ?? <span className="muted">Not set</span>}</dd>
            <dt>Group</dt><dd>{org ? <Link className="link" href={`/ops/organizations/${org.id}`}>{org.name}</Link> : <span className="muted">Not in a group yet. Edit the details to add one.</span>}</dd>
            <dt>Role in decisions</dt><dd>{row.decision_role ? label(DECISION_ROLES, String(row.decision_role)) : <span className="muted">Not set</span>}</dd>
            {row.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{String(row.notes)}</dd></>}
          </dl>
        </section>

        <section className="card" style={{ marginTop: 0, borderColor: dnc ? '#f3c6c0' : undefined, background: dnc ? 'var(--danger-soft)' : undefined }} aria-labelledby="reach">
          <h2 id="reach">Reach them</h2>
          {dnc ? (
            <div className="stack" style={{ marginTop: 8 }}>
              <p><b style={{ color: 'var(--danger)' }}>Do not contact.</b> {dncNote ? dncNote.replace('Marked do not contact', '').replace(/^: /, '') : ''}</p>
              <form action={doNotContactAction.bind(null, id, false)}><input type="hidden" name="reason" value="" /><button className="btn sm">OK to contact again</button></form>
            </div>
          ) : (
            <>
              <div className="row" style={{ margin: '10px 0' }}>
                {email && <a className="btn sm" href={`mailto:${email}`}><Mail size={15} aria-hidden /> {email}</a>}
                {phone && <a className="btn sm" href={`tel:${phone.replace(/[^\d+]/g, '')}`}><Phone size={15} aria-hidden /> {phone}</a>}
                {!email && !phone && <span className="muted">No email or phone yet. Edit the details to add one.</span>}
              </div>
              <p className="tiny muted">Only the team sees this. It is never shown on the website.</p>
              <details style={{ marginTop: 12 }}>
                <summary className="small" style={{ cursor: 'pointer', color: 'var(--danger)' }}>They asked us to stop</summary>
                <form action={doNotContactAction.bind(null, id, true)} className="stack" style={{ marginTop: 10 }}>
                  <div className="field"><label htmlFor="reason">What did they say? (optional)</label><input id="reason" name="reason" className="input" maxLength={200} /></div>
                  <button className="btn sm danger" style={{ justifySelf: 'start' }}>Mark as do not contact</button>
                </form>
              </details>
            </>
          )}
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="conv">
          <h2 id="conv">Requests that involve them</h2>
          {requests.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>None yet.</p> : requests.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <Link className="link" href={`/ops/requests/${r.id}`}>{r.from_name} <span className="muted small">{r.ref} · {fmtDate(r.received_at)}</span></Link><StatusPill status={r.status} />
            </div>))}
        </section>
        <HistoryCard slug="contacts" entity="contacts" id={id} />
      </div>

      <div className="stack">
        <section className="card" style={{ marginTop: 0 }} aria-labelledby="own">
          <h2 id="own">Who on our team knows them?</h2>
          <form action={contactOwnerAction.bind(null, id)} className="row" style={{ marginTop: 10 }}>
            <label className="sr-only" htmlFor="owner">Team member</label>
            <select id="owner" name="owner_id" className="select" style={{ flex: 1 }} defaultValue={row.owner_id ? String(row.owner_id) : ''}><option value="">Nobody yet</option>{users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button className="btn sm">Save</button>
          </form>
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="out">
          <h2 id="out">Outreach list</h2>
          {outreach ? (
            <>
              <p className="small muted" style={{ margin: '6px 0 8px' }}>On the list{outreach.who ? `, added by ${outreach.who}` : ''}.</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {([['Qualified', outreach.qualified_at], ['Contacted', outreach.contacted_at], ['Followed up', outreach.followup_at], ['Replied', outreach.replied_at], ['Had a meeting', outreach.meeting_at]] as const).map(([l, d]) => (
                  <li key={l} className="row small" style={{ justifyContent: 'space-between', padding: '4px 0' }}><span>{l}</span>{d ? <span className="pill ok">{fmtDate(d)}</span> : <span className="muted">Not yet</span>}</li>))}
              </ul>
              <p style={{ marginTop: 8 }}><Link className="link small" href="/ops/pilot">Update it on the Pilot goals page</Link></p>
            </>
          ) : dnc ? <p className="muted small" style={{ marginTop: 8 }}>Not on the list, because they are marked do not contact.</p> : (
            <div style={{ marginTop: 8 }}><p className="small muted" style={{ marginBottom: 10 }}>Add them to track first contact, follow-ups and replies.</p><OutreachForm contactId={id} /></div>
          )}
        </section>

        <CheckCard slug="contacts" id={id} row={row} />
      </div>
    </div>
  );
}
