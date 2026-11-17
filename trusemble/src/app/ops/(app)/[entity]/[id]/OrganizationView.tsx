import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { all, get } from '@/lib/db';
import { fmtMoney } from '@/lib/format';
import { label, ORG_TYPES, PROJECT_STAGES } from '@/lib/constants';
import { safeHref } from '@/lib/safe-url';
import { findDuplicates } from '@/lib/people';
import { StatusPill } from '@/components/ops/ui';
import { CheckCard, HistoryCard, PublishCard } from './RecordParts';
import { MergeForm } from './MergeForm';

type Row = Record<string, string | number | null>;

/** One group: who they are, who we know there, what they run, what they asked us, what money they received. */
export async function OrganizationView({ id, row }: { id: number; row: Row }) {
  const site = safeHref(row.website as string | null);
  const people = await all<{ id: number; name: string; title: string | null; email: string | null; phone: string | null; do_not_contact: number }>('SELECT id, name, title, email, phone, do_not_contact FROM contacts WHERE org_id = ? AND archived = 0 ORDER BY name LIMIT 12', id);
  const projects = await all<{ id: number; name: string; stage: string; published: number }>('SELECT id, name, stage, published FROM projects WHERE owner_org_id = ? AND archived = 0 ORDER BY name LIMIT 12', id);
  const requests = await all<{ id: number; ref: string; kind: string; status: string }>('SELECT id, ref, kind, status FROM requests WHERE org_id = ? AND archived = 0 ORDER BY id DESC LIMIT 8', id);
  const money = await get<{ n: number; s: number | null }>('SELECT COUNT(*) n, SUM(amount_committed) s FROM awards WHERE org_id = ?', id);
  const byProgram = await all<{ name: string | null; n: number; s: number | null }>('SELECT pr.name, COUNT(*) n, SUM(a.amount_committed) s FROM awards a LEFT JOIN programs pr ON pr.id = a.program_id WHERE a.org_id = ? GROUP BY pr.id ORDER BY s DESC LIMIT 5', id);
  const dupes = await findDuplicates(id);

  return (
    <div className="detail-grid" style={{ marginTop: 4 }}>
      <div className="stack">
        <section className="card" style={{ marginTop: 0 }} aria-labelledby="who">
          <h2 id="who">Who they are</h2>
          <dl className="kv-list" style={{ gridTemplateColumns: '170px 1fr', marginTop: 10 }}>
            <dt>Kind of group</dt><dd>{row.type && row.type !== 'other' ? label(ORG_TYPES, String(row.type)) : <span className="muted">Not set</span>}</dd>
            <dt>Place</dt><dd>{[row.city, row.county, row.state].filter(Boolean).join(', ') || <span className="muted">Not set</span>}</dd>
            <dt>Website</dt><dd>{site ? <a className="link" href={site} target="_blank" rel="noopener noreferrer">{String(row.website).replace(/^https?:\/\//, '')}</a> : <span className="muted">Not set</span>}</dd>
            {row.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{String(row.notes)}</dd></>}
          </dl>
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="ppl">
          <div className="card-head"><h2 id="ppl">People we know there</h2><Link className="btn sm" href={`/ops/contacts/new?org_id=${id}`}>+ Add a person</Link></div>
          {people.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>Nobody yet.</p> : people.map((c) => (
            <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <span><Link className="link" href={`/ops/contacts/${c.id}`}><b>{c.name}</b></Link>{c.title && <span className="small muted"> · {c.title}</span>}{c.do_not_contact ? <span className="pill bad" style={{ marginLeft: 8 }}>Do not contact</span> : null}</span>
              {!c.do_not_contact && <span className="row">{c.email && <a className="btn sm" href={`mailto:${c.email}`}><Mail size={14} aria-hidden /> Email</a>}{c.phone && <a className="btn sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Phone size={14} aria-hidden /> Call</a>}</span>}
            </div>))}
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="prj">
          <div className="card-head"><h2 id="prj">Projects they run</h2><Link className="btn sm" href={`/ops/projects/new?owner_org_id=${id}`}>+ Add a project</Link></div>
          {projects.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>None yet.</p> : projects.map((p) => (
            <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <Link className="link" href={`/ops/projects/${p.id}`}>{p.name}</Link>
              <span className="row" style={{ gap: 6 }}><span className={`pill ${p.stage === 'complete' ? 'ok' : p.stage === 'seeking_funding' ? 'new' : 'info'}`}>{label(PROJECT_STAGES, p.stage)}</span>{!p.published && <span className="pill quiet">Hidden</span>}</span>
            </div>))}
        </section>

        {requests.length > 0 && (
          <section className="card" style={{ marginTop: 0 }} aria-labelledby="req">
            <h2 id="req">Requests from them</h2>
            {requests.map((r) => <div key={r.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line)' }}><Link className="link" href={`/ops/requests/${r.id}`}>{r.ref}</Link><StatusPill status={r.status} /></div>)}
          </section>
        )}

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="mon">
          <h2 id="mon">Money they have received</h2>
          {money && money.n > 0 ? (
            <>
              <p style={{ margin: '8px 0' }}><b className="num">{money.n}</b> awards, about <b>{fmtMoney(money.s ?? 0, { compact: true })}</b> promised. This is history, not money available now.</p>
              {byProgram.map((p) => <div key={p.name ?? 'x'} className="row small" style={{ justifyContent: 'space-between', padding: '4px 0' }}><span>{p.name ?? 'Program not recorded'}</span><span className="muted">{p.n} · {fmtMoney(p.s ?? 0, { compact: true })}</span></div>)}
            </>
          ) : <p className="muted" style={{ marginTop: 8 }}>No awards on record.</p>}
        </section>
        <HistoryCard slug="organizations" entity="organizations" id={id} />
      </div>

      <div className="stack">
        {dupes.length > 0 && (
          <section className="card" style={{ marginTop: 0, borderColor: '#e7c690', background: 'var(--accent-soft)' }} aria-labelledby="dup">
            <h2 id="dup">May be listed twice</h2>
            <p className="small" style={{ margin: '6px 0 10px' }}>Another group has the same name. If it is the same group, merge it into this one so nobody is split across two records.</p>
            {dupes.map((d) => (
              <div key={d.id} style={{ padding: '10px 0', borderTop: '1px solid #f0d9b3' }}>
                <Link className="link" href={`/ops/organizations/${d.id}`}><b>{d.name}</b></Link>
                <div className="small muted">{[d.county, d.state].filter(Boolean).join(', ') || 'No place'} · {d.projects} projects · {d.people} people · {d.requests} requests</div>
                <details style={{ marginTop: 8 }}><summary className="btn sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>Merge it into this group…</summary><div style={{ marginTop: 10 }}><MergeForm intoId={id} fromId={d.id} fromName={d.name} /></div></details>
              </div>))}
          </section>
        )}
        <PublishCard table="organizations" id={id} row={row} />
        <CheckCard slug="organizations" id={id} row={row} />
      </div>
    </div>
  );
}
