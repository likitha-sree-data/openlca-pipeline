import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OpsPage } from '@/components/ops/Shell';
import { Prio, StatusPill, VerifPill } from '@/components/ops/ui';
import { EntityForm } from '@/components/ops/EntityForm';
import { entityBySlug, type EntityCfg } from '@/lib/entities';
import { getRow, userOptions } from '@/lib/crud';
import { addNoteAction, archiveAction, moveAction, saveEntity, unverifyAction, verifyAction } from '@/app/ops/actions';
import { all, get } from '@/lib/db';
import { safeHref } from '@/lib/safe-url';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { label, PROJECT_STAGES, REQUEST_KINDS, REQUEST_STATUSES } from '@/lib/constants';

type Row = Record<string, string | number | null>;

export async function generateMetadata({ params }: { params: Promise<{ entity: string; id: string }> }): Promise<Metadata> {
  const { entity, id } = await params;
  const cfg = entityBySlug(entity);
  const row = cfg && /^\d+$/.test(id) ? getRow<Row>(cfg, Number(id)) : undefined;
  return { title: row ? String(row[cfg!.titleCol]) : 'Not found' };
}

export default async function EntityDetail({ params, searchParams }: { params: Promise<{ entity: string; id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { entity, id } = await params;
  const cfg = entityBySlug(entity);
  if (!cfg || !/^\d+$/.test(id)) notFound();
  const rid = Number(id);
  const row = getRow<Row>(cfg, rid);
  if (!row) notFound();
  const sp = await searchParams;

  const refLabels: Record<string, string> = {};
  for (const f of cfg.fields) {
    if (f.type === 'ref' && f.ref && f.ref !== 'users' && row[f.name]) {
      refLabels[f.name] = get<{ n: string }>(`SELECT name n FROM ${f.ref} WHERE id = ?`, Number(row[f.name]))?.n ?? '';
    }
  }
  const activity = all<{ id: number; kind: string; body: string; created_at: string; user: string | null }>(
    `SELECT a.id, a.kind, a.body, a.created_at, u.name user FROM activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.entity = ? AND a.entity_id = ? ORDER BY a.id DESC LIMIT 40`, cfg.key, rid,
  );
  const source = row.source_id ? get<{ name: string; url: string | null; kind: string }>('SELECT name, url, kind FROM sources WHERE id = ?', Number(row.source_id)) : undefined;
  const verifier = row.verified_by ? get<{ name: string }>('SELECT name FROM users WHERE id = ?', Number(row.verified_by))?.name : null;
  const title = String(row[cfg.titleCol]);
  const archived = !!row.archived;
  const publicHref = cfg.key === 'projects' && row.published ? `/projects/${rid}` : null;

  return (
    <OpsPage section={cfg.singular[0].toUpperCase() + cfg.singular.slice(1)}>
      <p className="small"><Link className="link" href={`/ops/${cfg.slug}`}>← {cfg.plural[0].toUpperCase() + cfg.plural.slice(1)}</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', margin: '8px 0 6px', alignItems: 'flex-start' }}>
        <div>
          <h1>{title}</h1>
          <p className="row" style={{ marginTop: 8 }}>
            {cfg.key === 'requests' && <><span className="muted">{String(row.ref)}</span><StatusPill status={String(row.status)} /><Prio p={row.priority as string | null} /></>}
            <VerifPill v={String(row.verification)} />
            {archived && <span className="pill bad">Archived</span>}
            {publicHref && <Link className="link small" href={publicHref}>View public page</Link>}
          </p>
        </div>
        <form action={archiveAction.bind(null, cfg.slug, rid, !archived)}><button className="btn sm">{archived ? 'Restore' : 'Archive'}</button></form>
      </div>
      {sp.created && <div className="alert ok" role="status" style={{ margin: '12px 0' }}>Created. You can keep editing below.</div>}

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <EntityForm fields={cfg.fields} values={row} refLabels={refLabels} userOpts={userOptions()} action={saveEntity.bind(null, cfg.slug, rid)} submitLabel="Save changes" />
        </div>
        <div className="stack">
          {cfg.verifiable && (
            <section className="card" style={{ marginTop: 0 }} aria-labelledby="ver">
              <h2 id="ver" style={{ fontSize: 16 }}>Verification</h2>
              {row.verification === 'verified' ? (
                <>
                  <p className="small" style={{ margin: '8px 0' }}>Checked against its source{verifier ? ` by ${verifier}` : ''}{row.verified_at ? ` on ${fmtDate(String(row.verified_at))}` : ''}.</p>
                  <form action={unverifyAction.bind(null, cfg.slug, rid)}><button className="btn sm">Remove verification</button></form>
                </>
              ) : (
                <form action={verifyAction.bind(null, cfg.slug, rid)} className="stack" style={{ marginTop: 8 }}>
                  <p className="small muted">{row.verification === 'demo' ? 'Demo rows are generated. Verify only after replacing them with a real record.' : 'Open the source, compare, then mark it checked.'}</p>
                  <div className="field"><label htmlFor="outcome">Outcome</label><select id="outcome" name="outcome" className="select"><option value="confirmed">Matches the source</option><option value="corrected">Corrected from the source</option></select></div>
                  <div className="field"><label htmlFor="note">Note (optional)</label><input id="note" name="note" className="input" maxLength={300} /></div>
                  <button className="btn primary sm">Mark as checked</button>
                </form>
              )}
              {source && <p className="small" style={{ marginTop: 12 }}>Source: {safeHref(source.url) ? <a className="link" href={safeHref(source.url)!} target="_blank" rel="noopener noreferrer">{source.name}</a> : source.name}</p>}
            </section>
          )}
          {(cfg.key === 'requests' || cfg.key === 'projects') && (
            <section className="card" style={{ marginTop: 0 }}>
              <h2 style={{ fontSize: 16 }}>{cfg.key === 'requests' ? 'Move to' : 'Stage'}</h2>
              <form action={moveAction.bind(null, cfg.slug, rid)} className="row" style={{ marginTop: 10 }}>
                <select name="to" className="select" style={{ flex: 1 }} defaultValue={String(row[cfg.key === 'requests' ? 'status' : 'stage'])} aria-label="Move to">
                  {(cfg.key === 'requests' ? REQUEST_STATUSES : PROJECT_STAGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="btn sm">Move</button>
              </form>
            </section>
          )}
          <Related cfg={cfg} id={rid} row={row} />
          <section className="card" style={{ marginTop: 0 }} aria-labelledby="act">
            <h2 id="act" style={{ fontSize: 16 }}>Activity</h2>
            <form action={addNoteAction.bind(null, cfg.slug, rid)} className="stack" style={{ margin: '10px 0 14px' }}>
              <label className="sr-only" htmlFor="body">Add a note</label>
              <textarea id="body" name="body" className="textarea" style={{ minHeight: 70 }} placeholder="Add a note" maxLength={4000} required />
              <button className="btn sm" style={{ justifySelf: 'start' }}>Add note</button>
            </form>
            <div className="timeline">
              {activity.map((a) => (
                <div className="ev" key={a.id}><time dateTime={a.created_at}>{fmtDateTime(a.created_at)}</time><div><span className="small muted">{a.user ?? 'System'}{a.kind !== 'note' ? ` · ${a.kind}` : ''}</span><div>{a.body}</div></div></div>
              ))}
              {activity.length === 0 && <p className="muted small">Nothing yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </OpsPage>
  );
}

function Related({ cfg, id, row }: { cfg: EntityCfg; id: number; row: Row }) {
  const li = (href: string, text: React.ReactNode, sub?: React.ReactNode) => <li key={href + String(text)} style={{ padding: '6px 0' }}><Link className="link" href={href}>{text}</Link>{sub && <span className="small muted"> · {sub}</span>}</li>;
  const wrap = (title: string, items: React.ReactNode[], empty = 'None') => (
    <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 16 }}>{title}</h2>{items.length ? <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{items}</ul> : <p className="small muted" style={{ marginTop: 8 }}>{empty}</p>}</section>
  );
  switch (cfg.key) {
    case 'organizations': {
      const projects = all<{ id: number; name: string; stage: string }>('SELECT id, name, stage FROM projects WHERE owner_org_id = ? AND archived = 0 ORDER BY name LIMIT 20', id);
      const contacts = all<{ id: number; name: string; title: string | null }>('SELECT id, name, title FROM contacts WHERE org_id = ? AND archived = 0 ORDER BY name LIMIT 20', id);
      const awards = get<{ n: number; s: number | null }>('SELECT COUNT(*) n, SUM(amount_committed) s FROM awards WHERE org_id = ?', id);
      return <>
        {wrap('Projects', projects.map((p) => li(`/ops/projects/${p.id}`, p.name, label(PROJECT_STAGES, p.stage))))}
        {wrap('Contacts', contacts.map((c) => li(`/ops/contacts/${c.id}`, c.name, c.title)))}
        <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 16 }}>Awards</h2><p className="small" style={{ marginTop: 8 }}>{awards?.n ?? 0} on record{awards?.s ? `, ${fmtMoney(awards.s, { compact: true })} committed` : ''}</p></section>
        <p><Link className="btn sm" href={`/ops/contacts/new?org_id=${id}`}>Add a contact</Link></p>
      </>;
    }
    case 'projects': {
      const matches = all<{ id: number; program_id: number; name: string; status: string; reason: string }>('SELECT m.id, m.program_id, pr.name, m.status, m.reason FROM matches m JOIN programs pr ON pr.id = m.program_id WHERE m.project_id = ? AND m.status != \'dismissed\' ORDER BY m.score DESC', id);
      const awards = all<{ id: number; name: string | null; amount_committed: number | null; year: number | null }>('SELECT a.id, pr.name, a.amount_committed, a.year FROM awards a LEFT JOIN programs pr ON pr.id = a.program_id WHERE a.project_id = ?', id);
      const reqs = all<{ id: number; ref: string; from_name: string }>('SELECT id, ref, from_name FROM requests WHERE project_id = ? ORDER BY id DESC', id);
      return <>
        {row.owner_org_id ? <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 16 }}>Owner</h2><p style={{ marginTop: 8 }}><Link className="link" href={`/ops/organizations/${row.owner_org_id}`}>{refLabel('organizations', Number(row.owner_org_id))}</Link></p></section> : null}
        {wrap('Suggested programs', matches.map((m) => li(`/ops/funding/${m.program_id}`, m.name, `${m.status}. ${m.reason}`)), 'No suggestions. Open Matches and generate them.')}
        {wrap('Awards', awards.map((a) => li('#', a.name ?? 'Award', `${fmtMoney(a.amount_committed)} ${a.year ?? ''}`)))}
        {wrap('Requests', reqs.map((r) => li(`/ops/requests/${r.id}`, r.from_name, r.ref)))}
      </>;
    }
    case 'contacts': {
      const reqs = all<{ id: number; ref: string; from_name: string }>('SELECT id, ref, from_name FROM requests WHERE contact_id = ? ORDER BY id DESC', id);
      return <>
        {row.org_id ? <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 16 }}>Organization</h2><p style={{ marginTop: 8 }}><Link className="link" href={`/ops/organizations/${row.org_id}`}>{refLabel('organizations', Number(row.org_id))}</Link></p></section> : null}
        {wrap('Requests', reqs.map((r) => li(`/ops/requests/${r.id}`, r.from_name, r.ref)))}
      </>;
    }
    case 'programs': {
      const awards = all<{ id: number; org: string | null; amount_committed: number | null; year: number | null }>('SELECT a.id, o.name org, a.amount_committed, a.year FROM awards a LEFT JOIN organizations o ON o.id = a.org_id WHERE a.program_id = ? ORDER BY a.amount_committed DESC LIMIT 10', id);
      const total = get<{ n: number; s: number | null }>('SELECT COUNT(*) n, SUM(amount_committed) s FROM awards WHERE program_id = ?', id);
      const matches = get<{ n: number }>("SELECT COUNT(*) n FROM matches WHERE program_id = ? AND status != 'dismissed'", id)?.n ?? 0;
      return <>
        <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 16 }}>Awards on record</h2><p className="small" style={{ marginTop: 8 }}>{total?.n ?? 0} awards{total?.s ? `, ${fmtMoney(total.s, { compact: true })} committed` : ''}. Committed and disbursed are never added together.</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{awards.map((a) => <li key={a.id} className="small" style={{ padding: '4px 0' }}>{a.org ?? 'Unknown recipient'} · {fmtMoney(a.amount_committed)} {a.year ?? ''}</li>)}</ul></section>
        <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 16 }}>Matches</h2><p className="small" style={{ marginTop: 8 }}>{matches} projects suggested. <Link className="link" href="/ops/matches">Open matches</Link></p></section>
        {safeHref(row.url as string | null) ? <p><a className="btn sm" href={safeHref(row.url as string)!} target="_blank" rel="noopener noreferrer">Program page</a></p> : null}
      </>;
    }
    case 'requests': {
      const links: React.ReactNode[] = [];
      if (row.org_id) links.push(li(`/ops/organizations/${row.org_id}`, refLabel('organizations', Number(row.org_id)), 'organization'));
      if (row.contact_id) links.push(li(`/ops/contacts/${row.contact_id}`, refLabel('contacts', Number(row.contact_id)), 'contact'));
      if (row.project_id) links.push(li(`/ops/projects/${row.project_id}`, refLabel('projects', Number(row.project_id)), 'project'));
      const payload = row.payload ? safeJson(String(row.payload)) : null;
      return <>
        {wrap('Linked records', links)}
        <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 16 }}>Received</h2><p className="small" style={{ marginTop: 8 }}>{fmtDateTime(String(row.received_at))} via {String(row.origin).replace('_', ' ')}. Kind: {label(REQUEST_KINDS, String(row.kind))}.</p>
          {payload && <dl className="kv-list" style={{ marginTop: 10 }}>{Object.entries(payload).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => <Fragment key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd></Fragment>)}</dl>}</section>
      </>;
    }
  }
}
function refLabel(table: string, id: number): string { return get<{ n: string }>(`SELECT name n FROM ${table} WHERE id = ?`, id)?.n ?? `#${id}`; }
function safeJson(s: string): Record<string, unknown> | null { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : null; } catch { return null; } }
