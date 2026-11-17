import Link from 'next/link';
import { all, get } from '@/lib/db';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { CHECK_LABEL } from '@/lib/constants';
import { safeHref } from '@/lib/safe-url';
import { addNoteAction, unverifyAction, verifyAction } from '@/app/ops/actions';
import { readinessOf } from '@/lib/publish';
import { PublishForm } from './PublishForm';

type Row = Record<string, string | number | null>;

/** "Can the public see this, and if not, what is missing?" with one button. */
export function PublishCard({ table, id, row }: { table: 'projects' | 'programs' | 'organizations'; id: number; row: Row }) {
  const r = readinessOf(table, row);
  const shown = !!row.published;
  const href = shown ? (table === 'projects' ? `/projects/${id}` : table === 'programs' ? '/funding' : '/projects?layers=communities,agencies,partners') : null;
  return (
    <section className="card" style={{ marginTop: 0 }} aria-labelledby="web">
      <h2 id="web">On the website</h2>
      <p style={{ margin: '8px 0 10px' }}>
        {shown ? <span className="pill ok">Shown on the website</span> : <span className="pill quiet">Hidden from the website</span>}
        {href && <> <Link className="link small" href={href}>{table === 'projects' ? 'See it' : table === 'programs' ? 'See the funding page' : 'See the map'}</Link></>}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {r.checks.map((c) => (
          <li key={c.key} style={{ padding: '6px 0', display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8 }}>
            <span aria-hidden style={{ color: c.ok ? 'var(--ok)' : c.required ? 'var(--danger)' : 'var(--muted-2)', fontWeight: 700 }}>{c.ok ? '✓' : c.required ? '!' : '○'}</span>
            <span><span className="small">{c.label}</span>{!c.ok && <span className="tiny muted" style={{ display: 'block' }}>{c.required ? 'Needed. ' : 'Helpful. '}{c.fix}</span>}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 12 }}>
        {shown ? <PublishForm table={table} id={id} show={false} /> : <PublishForm table={table} id={id} show disabled={!r.canPublish} />}
        {!shown && !r.canPublish && <p className="tiny muted" style={{ marginTop: 6 }}>The items marked ! are needed before it can be shown.</p>}
      </div>
    </section>
  );
}

/** Has a person compared this with its source? */
export async function CheckCard({ slug, id, row }: { slug: string; id: number; row: Row }) {
  const verifier = row.verified_by ? (await get<{ name: string }>('SELECT name FROM users WHERE id = ?', Number(row.verified_by)))?.name : null;
  const source = row.source_id ? await get<{ name: string; url: string | null }>('SELECT name, url FROM sources WHERE id = ?', Number(row.source_id)) : undefined;
  const link = safeHref(source?.url ?? null);
  return (
    <section className="card" style={{ marginTop: 0 }} aria-labelledby="chk">
      <h2 id="chk">Has a person checked it?</h2>
      <p style={{ margin: '8px 0' }}><span className={`pill ${row.verification === 'verified' ? 'ok' : row.verification === 'demo' ? 'warn' : 'quiet'}`}>{CHECK_LABEL[String(row.verification)]}</span></p>
      {row.verification === 'verified' ? (
        <>
          <p className="small">Compared with its source{verifier ? ` by ${verifier}` : ''}{row.verified_at ? ` on ${fmtDate(String(row.verified_at))}` : ''}.</p>
          <form action={unverifyAction.bind(null, slug, id)} style={{ marginTop: 8 }}><button className="btn sm">Mark as not checked</button></form>
        </>
      ) : (
        <form action={verifyAction.bind(null, slug, id)} className="stack" style={{ marginTop: 6 }}>
          <p className="small muted">{row.verification === 'demo' ? 'Sample records are made up. Replace them with a real record before marking anything checked.' : 'Open the source, compare, then mark it checked.'}</p>
          <div className="field"><label htmlFor="outcome">Result</label><select id="outcome" name="outcome" className="select"><option value="confirmed">It matches the source</option><option value="corrected">I fixed it, now it matches</option></select></div>
          <div className="field"><label htmlFor="note">Note (optional)</label><input id="note" name="note" className="input" maxLength={300} /></div>
          <button className="btn primary sm" style={{ justifySelf: 'start' }}>Mark as checked</button>
        </form>
      )}
      {source && <p className="small" style={{ marginTop: 12 }}>Source: {link ? <a className="link" href={link} target="_blank" rel="noopener noreferrer">{source.name}</a> : source.name}</p>}
    </section>
  );
}

/** Notes and everything that has happened to this record. */
export async function HistoryCard({ slug, entity, id }: { slug: string; entity: string; id: number }) {
  const activity = await all<{ id: number; kind: string; body: string; created_at: string; user: string | null }>(
    `SELECT a.id, a.kind, a.body, a.created_at, u.name AS "user" FROM activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.entity = ? AND a.entity_id = ? ORDER BY a.id DESC LIMIT 40`, entity, id,
  );
  return (
    <section className="card" style={{ marginTop: 0 }} aria-labelledby="hist">
      <h2 id="hist">What has happened</h2>
      <form action={addNoteAction.bind(null, slug, id)} className="stack" style={{ margin: '10px 0 14px' }}>
        <label className="sr-only" htmlFor="body">Add a note</label>
        <textarea id="body" name="body" className="textarea" style={{ minHeight: 70 }} placeholder="Add a note" maxLength={4000} required />
        <button className="btn sm" style={{ justifySelf: 'start' }}>Add note</button>
      </form>
      <div className="timeline">
        {activity.map((a) => <div className="ev" key={a.id}><time dateTime={a.created_at}>{fmtDateTime(a.created_at)}</time><div><span className="small muted">{a.user ?? 'System'}</span><div>{a.body}</div></div></div>)}
        {activity.length === 0 && <p className="muted small">Nothing yet.</p>}
      </div>
    </section>
  );
}
