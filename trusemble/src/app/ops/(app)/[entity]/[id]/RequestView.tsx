import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { all, get } from '@/lib/db';
import { fmtDate, fmtDateTime, relativeDays, todayIso } from '@/lib/format';
import { label, PROJECT_CATEGORIES, REQUEST_KINDS, REQUEST_STATUSES, US_STATES } from '@/lib/constants';
import { Prio, StatusPill } from '@/components/ops/ui';
import { addNoteAction, moveAction } from '@/app/ops/actions';
import { IntroducedForm, NextStepForm } from './RequestForms';

type R = {
  id: number; ref: string; kind: string; from_name: string; status: string; substatus: string | null; priority: string | null; amount_text: string | null; message: string | null;
  payload: string | null; origin: string; received_at: string; owner_id: number | null; next_action: string | null; next_action_date: string | null;
  org_id: number | null; contact_id: number | null; project_id: number | null; archived: number;
};

function plainValue(k: string, v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  if (k === 'category') return label(PROJECT_CATEGORIES, String(v));
  if (k === 'state') return US_STATES[String(v)] ?? String(v);
  return String(v);
}

const PAYLOAD_LABELS: Record<string, string> = { needs: 'What they need', homes: 'Homes', timeline: 'When', state: 'State', county: 'County', category: 'Kind of work', topic: 'Topic', side: 'They are a' };

/** One request, built around the job: read it, set the next step, move it forward, make the introduction. */
export function RequestView({ id, users }: { id: number; users: [string, string][] }) {
  const r = get<R>('SELECT * FROM requests WHERE id = ?', id)!;
  const org = r.org_id ? get<{ id: number; name: string }>('SELECT id, name FROM organizations WHERE id = ?', r.org_id) : undefined;
  const contact = r.contact_id ? get<{ id: number; name: string; title: string | null; email: string | null; phone: string | null; do_not_contact: number }>('SELECT id, name, title, email, phone, do_not_contact FROM contacts WHERE id = ?', r.contact_id) : undefined;
  const project = r.project_id ? get<{ id: number; name: string; county: string | null; state: string | null; published: number }>('SELECT id, name, county, state, published FROM projects WHERE id = ?', r.project_id) : undefined;
  const activity = all<{ id: number; kind: string; body: string; created_at: string; user: string | null }>(
    `SELECT a.id, a.kind, a.body, a.created_at, u.name user FROM activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.entity = 'requests' AND a.entity_id = ? ORDER BY a.id DESC LIMIT 40`, id,
  );
  const payload = (() => { try { return r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : null; } catch { return null; } })();
  const introLog = r.status === 'intro_made' ? activity.find((a) => a.body.startsWith('Introduction made:')) : undefined;
  const today = todayIso();
  const overdue = r.next_action_date && r.next_action_date < today && r.status !== 'closed';
  const closed = r.status === 'closed';

  return (
    <div className="stack">
      <div className="detail-grid" style={{ marginTop: 4 }}>
        <div className="stack">
          <section className="card" style={{ marginTop: 0 }} aria-labelledby="asked">
            <h2 id="asked">What they asked</h2>
            <p className="small muted" style={{ marginTop: 4 }}>{label(REQUEST_KINDS, r.kind)} · received {fmtDate(r.received_at)} ({relativeDays(r.received_at)}) via {r.origin === 'public_form' ? 'the website' : r.origin === 'import' ? 'a file' : 'the team'}</p>
            {r.message ? <p style={{ margin: '12px 0', fontSize: 17, whiteSpace: 'pre-wrap' }}>{r.message}</p> : <p className="muted" style={{ margin: '12px 0' }}>No message.</p>}
            <dl className="kv-list" style={{ gridTemplateColumns: '150px 1fr' }}>
              {r.amount_text && <><dt>Amount</dt><dd>{r.amount_text}</dd></>}
              {payload && Object.entries(payload).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{PAYLOAD_LABELS[k] ?? k.replace(/_/g, ' ')}</dt><dd>{plainValue(k, v)}</dd></div>)}
              {project && <><dt>Project</dt><dd><Link className="link" href={`/ops/projects/${project.id}`}>{project.name}</Link>{project.county ? ` · ${project.county}${project.state ? ', ' + project.state : ''}` : ''}{project.published ? '' : ' · not on the website yet'}</dd></>}
              {org && <><dt>Group</dt><dd><Link className="link" href={`/ops/organizations/${org.id}`}>{org.name}</Link></dd></>}
            </dl>
          </section>

          {contact && (
            <section className="card" style={{ marginTop: 0 }} aria-labelledby="who">
              <h2 id="who">Who to reply to</h2>
              <p style={{ margin: '8px 0 4px' }}><Link className="link" href={`/ops/contacts/${contact.id}`}><b>{contact.name}</b></Link>{contact.title ? <span className="muted"> · {contact.title}</span> : null}</p>
              {contact.do_not_contact ? <p className="pill bad">Marked do not contact</p> : (
                <div className="row" style={{ marginTop: 8 }}>
                  {contact.email && <a className="btn sm" href={`mailto:${contact.email}?subject=${encodeURIComponent(`Re: ${r.ref}`)}`}><Mail size={15} aria-hidden /> {contact.email}</a>}
                  {contact.phone && <a className="btn sm" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}><Phone size={15} aria-hidden /> {contact.phone}</a>}
                  {!contact.email && !contact.phone && <span className="muted small">No email or phone on file. Add one on the contact.</span>}
                </div>
              )}
              <p className="tiny muted" style={{ marginTop: 10 }}>Only the team sees this. It is never shown on the website.</p>
            </section>
          )}

          <section className="card" style={{ marginTop: 0 }} aria-labelledby="act">
            <h2 id="act">What has happened</h2>
            <form action={addNoteAction.bind(null, 'requests', id)} className="stack" style={{ margin: '10px 0 14px' }}>
              <label className="sr-only" htmlFor="body">Add a note</label>
              <textarea id="body" name="body" className="textarea" style={{ minHeight: 70 }} placeholder="Add a note: what you said, what they said" maxLength={4000} required />
              <button className="btn sm" style={{ justifySelf: 'start' }}>Add note</button>
            </form>
            <div className="timeline">
              {activity.map((a) => <div className="ev" key={a.id}><time dateTime={a.created_at}>{fmtDateTime(a.created_at)}</time><div><span className="small muted">{a.user ?? 'System'}</span><div>{a.body}</div></div></div>)}
              {activity.length === 0 && <p className="muted small">Nothing yet.</p>}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card" style={{ marginTop: 0 }} aria-labelledby="stand">
            <h2 id="stand">Where it stands</h2>
            <div className="row" style={{ margin: '10px 0' }}><StatusPill status={r.status} />{r.substatus && <span className="small muted">{r.substatus}</span>}{r.priority && <Prio p={r.priority} />}</div>
            <div className="row" style={{ gap: 6 }} role="group" aria-label="Move this request">
              {REQUEST_STATUSES.filter(([v]) => v !== r.status && v !== 'intro_made').map(([v, l]) => (
                <form key={v} action={moveAction.bind(null, 'requests', id)}><input type="hidden" name="to" value={v} /><button className="btn sm">{v === 'closed' ? 'Close it' : `Move to ${l}`}</button></form>
              ))}
            </div>
          </section>

          <section className="card" style={{ marginTop: 0 }} aria-labelledby="next">
            <h2 id="next">Next step</h2>
            {overdue && <p className="pill bad" style={{ margin: '8px 0' }}>Overdue since {fmtDate(r.next_action_date)}</p>}
            {!r.next_action_date && !closed && <p className="small" style={{ margin: '8px 0', color: 'var(--accent)' }}>This has no next step yet. Set one so it does not get forgotten.</p>}
            <div style={{ marginTop: 10 }}><NextStepForm id={id} ownerId={r.owner_id} date={r.next_action_date} text={r.next_action} users={users} /></div>
          </section>

          {introLog && (
            <section className="card" style={{ marginTop: 0, borderColor: '#b9dcc9', background: 'var(--ok-soft)' }} aria-labelledby="introdone">
              <h2 id="introdone">Introduction made</h2>
              <p style={{ margin: '8px 0 4px' }}>{introLog.body.replace('Introduction made: ', '')}</p>
              <p className="small muted">{fmtDateTime(introLog.created_at)}{introLog.user ? ` · ${introLog.user}` : ''}. Check in on {r.next_action_date ? fmtDate(r.next_action_date) : 'it soon'} to see how it went.</p>
            </section>
          )}
          {!closed && r.status !== 'intro_made' && (
            <section className="card" style={{ marginTop: 0 }} aria-labelledby="intro">
              <h2 id="intro">Make the introduction</h2>
              <p className="card-sub" style={{ margin: '4px 0 12px' }}>Only after both sides have said yes.</p>
              <IntroducedForm id={id} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
