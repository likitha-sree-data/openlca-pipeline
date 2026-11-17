import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mail, Phone, Search } from 'lucide-react';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead, Prio, Split, StatusPill, VerifPill } from '@/components/ops/ui';
import { AutoForm } from '@/components/ops/AutoForm';
import { distinctOptions, listRows, userOptions } from '@/lib/crud';
import { entityBySlug, type EntityCfg } from '@/lib/entities';
import { label, ORG_TYPES, PROGRAM_TYPES, PROJECT_STAGES, REQUEST_KINDS, REQUEST_STATUSES, DECISION_ROLES } from '@/lib/constants';
import { fmtDate, fmtInt, fmtMoney, fmtRange, todayIso } from '@/lib/format';
import { deadlineNote } from '@/lib/programs';
import { whereLabel } from '@/lib/crud';
import { scheduleAction, moveAction } from '@/app/ops/actions';
import { get } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { quickFilters } from '@/lib/quick-filters';
import { safeHref } from '@/lib/safe-url';

type Row = Record<string, string | number | null>;
type SP = Record<string, string | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ entity: string }> }): Promise<Metadata> {
  const cfg = entityBySlug((await params).entity);
  return { title: cfg ? cfg.plural[0].toUpperCase() + cfg.plural.slice(1) : 'Not found' };
}

const SEARCH_HINT: Record<string, string> = {
  requests: 'Search by name, reference or next step',
  projects: 'Search by project, owner or county',
  organizations: 'Search by name, county or website',
  contacts: 'Search by name, email or organization',
  programs: 'Search by program, who runs it or what it pays for',
};

const TABS: [string, string, string][] = [['all', 'All', ''], ['new', 'New', 'new'], ['conversation', 'Talking', 'qualified'], ['progress', 'Working on it', 'matching'], ['intro', 'Introduced', 'intro_made'], ['closed', 'Closed', 'closed']];

export default async function EntityList({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<SP> }) {
  const cfg = entityBySlug((await params).entity);
  if (!cfg) notFound();
  const sp = await searchParams;
  const limit = Math.min(500, Math.max(50, Number(sp.limit) || 50));
  const filters: Record<string, string | undefined> = {};
  for (const f of cfg.filters) filters[f.name] = sp[f.name] ?? (f.name === 'archived' ? 'no' : undefined);
  if (filters.archived === 'any') filters.archived = undefined;
  const needsSchedule = cfg.key === 'requests' && sp.needs === 'schedule';
  const view = sp.view === 'board' && (cfg.key === 'requests' || cfg.key === 'projects') ? 'board' : 'table';
  const me = await currentUser();
  const today = todayIso();
  const quick = quickFilters(cfg.key, today, me?.id ?? -1);
  const show = sp.show && quick[sp.show] ? sp.show : undefined;
  const { rows, total, counts } = listRows<Row>(cfg, { q: sp.q, verification: sp.v, filters, tab: sp.tab, extra: show ? quick[show] : undefined, limit: view === 'board' ? 300 : limit });
  const shown = needsSchedule ? rows.filter((r) => !r.next_action_date && r.status !== 'closed') : rows;
  const users = userOptions();
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/ops/${cfg.slug}${s ? '?' + s : ''}`;
  };
  const tabCounts = cfg.key === 'requests' ? tabCountsFor() : null;

  return (
    <OpsPage section={cfg.plural[0].toUpperCase() + cfg.plural.slice(1)}>
      <PageHead title={cfg.plural[0].toUpperCase() + cfg.plural.slice(1)}>{cfg.description}</PageHead>
      <div className="toolbar">
        <Link href={`/ops/${cfg.slug}/new`} className="btn sm">+ {cfg.newLabel}</Link>
        {(cfg.key === 'requests' || cfg.key === 'projects') && (
          <div className="seg" role="group" aria-label="View">
            <Link href={qs({ view: undefined })} className={view === 'table' ? 'on' : ''}>Table</Link>
            <Link href={qs({ view: 'board' })} className={view === 'board' ? 'on' : ''}>Board</Link>
          </div>
        )}
        <a className="link small" href={`/api/ops/export/${cfg.slug}`}>Export CSV</a>
      </div>

      {tabCounts && (
        <nav className="tabs" aria-label="Status">
          {TABS.map(([k, l]) => <Link key={k} href={qs({ tab: k === 'all' ? undefined : k })} className={(sp.tab ?? 'all') === k ? 'on' : ''}>{l}<span className="n">{tabCounts[k]}</span></Link>)}
        </nav>
      )}

      {Object.keys(quick).length > 0 && (
        <div className="seg" role="group" aria-label="Quick filters" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
          <Link href={qs({ show: undefined })} className={!show ? 'on' : ''}>{cfg.key === 'requests' ? 'Everyone' : 'All'}</Link>
          {Object.entries(quick).map(([k, q]) => <Link key={k} href={qs({ show: k })} className={show === k ? 'on' : ''}>{q.label}</Link>)}
        </div>
      )}
      <AutoForm className="toolbar">
        {view === 'board' && <input type="hidden" name="view" value="board" />}
        {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
        {sp.v && <input type="hidden" name="v" value={sp.v} />}
        {sp.show && <input type="hidden" name="show" value={sp.show} />}
        {sp.needs && <input type="hidden" name="needs" value={sp.needs} />}
        <label className="sr-only" htmlFor="q">Search</label>
        <div className="search" style={{ position: 'relative' }}><Search size={16} aria-hidden style={{ position: 'absolute', left: 14, top: 13, color: 'var(--muted)' }} /><input id="q" name="q" defaultValue={sp.q} className="input" style={{ paddingLeft: 36, width: '100%' }} placeholder={SEARCH_HINT[cfg.key]} /></div>
        {cfg.key !== 'requests' && <div className="seg" role="group" aria-label="Verification">
          {[['', 'All'], ['verified', 'Checked'], ['unverified', 'Not yet checked'], ['demo', 'Sample']].map(([v, l]) => <Link key={v} href={qs({ v: v || undefined })} className={(sp.v ?? '') === v ? 'on' : ''}>{l}</Link>)}
        </div>}
        {cfg.filters.map((f) => {
          const opts: readonly (readonly [string, string])[] = f.options.length ? f.options : distinctOptions(cfg, f.name);
          const cur = filters[f.name] ?? (f.name === 'archived' ? 'any' : '');
          return (
            <select key={f.name} name={f.name} className="select" defaultValue={cur} aria-label={f.label}>
              <option value={f.name === 'archived' ? 'any' : ''}>{f.name === 'archived' ? 'Active and archived' : `${f.label}: any`}</option>
              {f.name === 'owner' && users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          );
        })}
        <noscript><button className="btn sm">Apply</button></noscript>
      </AutoForm>

      <p className="row" style={{ gap: 18, margin: '4px 0 14px' }}><span><b className="num">{fmtInt(total)}</b> {cfg.plural} shown</span><Split v={counts.verified} u={counts.unverified} d={counts.demo} />{cfg.key === 'organizations' && <span className="muted small">{fmtInt(Number(get<{ n: number }>('SELECT COUNT(*) n FROM organizations WHERE published = 1 AND archived = 0')?.n))} shown on the website</span>}</p>

      {needsSchedule && <div className="alert" style={{ marginBottom: 14 }}>Giving each open request an owner and a next action date. <Link className="link" href="/ops/requests">Back to all requests</Link></div>}

      {view === 'board' ? <Board cfg={cfg} rows={shown} /> : needsSchedule ? <Schedule rows={shown} users={users} /> : <Table cfg={cfg} rows={shown} />}

      {view === 'table' && !needsSchedule && (
        <div className="pager">
          <span>Showing {fmtInt(Math.min(limit, rows.length))} of {fmtInt(total)}</span>
          {rows.length < total && <Link href={qs({ limit: String(limit + 50) })} className="btn sm">Show 50 more</Link>}
        </div>
      )}
    </OpsPage>
  );
}

function tabCountsFor(): Record<string, number> {
  const c = (sql: string) => Number((get<{ n: number }>(`SELECT COUNT(*) n FROM requests WHERE archived = 0${sql}`))?.n ?? 0);
  return { all: c(''), new: c(" AND status IN ('new','needs_info')"), conversation: c(" AND status = 'qualified'"), progress: c(" AND status = 'matching'"), intro: c(" AND status = 'intro_made'"), closed: c(" AND status = 'closed'") };
}

function Empty({ what }: { what: string }) { return <div className="empty">No {what} match this view.</div>; }

function Table({ cfg, rows }: { cfg: EntityCfg; rows: Row[] }) {
  const today = todayIso();
  if (rows.length === 0) return <Empty what={cfg.plural} />;
  const link = (r: Row, text: React.ReactNode) => <Link href={`/ops/${cfg.slug}/${r.id}`}>{text}</Link>;
  const head: Record<string, string[]> = {
    organizations: ['Name', 'Kind', 'County', 'Projects', 'Checked?'],
    projects: ['Project', 'Owner', 'Where it stands', 'County', 'Needs', 'Asking for', 'On the website'],
    contacts: ['Name', 'Organization', 'Role', 'Contact details', 'Owner'],
    programs: ['Program', 'Run by', 'Kind', 'Deadline', 'How much', 'Where', 'Who to call'],
    requests: ['From', 'Kind', 'Where it stands', 'Priority', 'Amount', 'Next step', 'Owner'],
  };
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr>{head[cfg.key].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)} style={r.archived ? { opacity: 0.55 } : undefined}>
              {cfg.key === 'organizations' && <>
                <td className="name">{link(r, r.name)}{r.website && <span className="sub">{String(r.website).replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>}</td>
                <td>{label(ORG_TYPES, String(r.type))}</td><td>{r.county ?? '–'}{r.state ? <span className="sub">{r.state}</span> : null}</td><td className="num">{r.projects}</td><td><VerifPill v={String(r.verification)} /></td>
              </>}
              {cfg.key === 'projects' && <>
                <td className="name" style={{ minWidth: 220 }}>{link(r, r.name)}</td><td>{r.owner ?? '–'}</td>
                <td><span className={`pill ${r.stage === 'complete' ? 'ok' : r.stage === 'seeking_funding' ? 'new' : 'info'}`}>{label(PROJECT_STAGES, String(r.stage))}</span></td>
                <td>{r.county ?? '–'}</td><td>{r.needs ?? ''}</td><td className="right num">{r.requested_amount ? fmtMoney(Number(r.requested_amount)) : '–'}</td>
                <td>{r.published ? (r.lat == null ? 'Shown, not on the map' : 'Shown') : 'Hidden'}</td>
              </>}
              {cfg.key === 'contacts' && <>
                <td className="name">{link(r, r.name)}{r.title && <span className="sub">{r.title}</span>}{r.do_not_contact ? <span className="pill bad" style={{ marginTop: 4 }}>Do not contact</span> : null}</td>
                <td>{r.organization ?? '–'}</td><td>{r.decision_role ? label(DECISION_ROLES, String(r.decision_role)) : '–'}</td>
                <td>{r.email && <div className="row" style={{ gap: 6 }}><Mail size={14} aria-label="Email" />{r.email}</div>}{r.phone && <div className="row" style={{ gap: 6 }}><Phone size={14} aria-label="Phone" />{r.phone}</div>}{!r.email && !r.phone && <span className="muted">None</span>}</td>
                <td>{r.owner ?? '–'}</td>
              </>}
              {cfg.key === 'programs' && <>
                <td className="name" style={{ minWidth: 220 }}>{link(r, r.name)}{r.awards ? <span className="sub">{r.awards} awards on record</span> : null}</td><td>{r.run_by}</td>
                <td>{label(PROGRAM_TYPES, String(r.type))}{r.focus && <span className="sub">{r.focus}</span>}</td>
                <td className="nowrap">{r.window_end ? fmtDate(String(r.window_end)) : 'Rolling'}<span className="sub">{deadlineNote({ window_start: r.window_start as string | null, window_end: r.window_end as string | null }, today)}</span></td>
                <td style={{ maxWidth: 200 }}>{fmtRange(r.award_min as number | null, r.award_max as number | null, r.award_text as string | null)}</td>
                <td>{whereLabel(String(r.scope), r.state as string | null, r.counties as string | null)}</td>
                <td>{r.contact_name ? <>{r.contact_name}{r.contact_email && <span className="sub">{r.contact_email}</span>}{r.contact_phone && <span className="sub">{r.contact_phone}</span>}</> : safeHref(r.url as string | null) ? <a className="link" href={safeHref(r.url as string)!} target="_blank" rel="noopener noreferrer">Website</a> : '–'}</td>
              </>}
              {cfg.key === 'requests' && <>
                <td className="name" style={{ minWidth: 200 }}>{link(r, r.from_name)}<span className="sub">{r.ref}{r.contact ? ` · ${r.contact}` : ''}</span></td>
                <td>{label(REQUEST_KINDS, String(r.kind))}</td>
                <td><StatusPill status={String(r.status)} />{r.substatus && <span className="sub" style={{ marginTop: 4 }}>{r.substatus}</span>}</td>
                <td><Prio p={r.priority as string | null} /></td><td style={{ maxWidth: 140 }}>{r.amount_text ?? '–'}</td>
                <td style={{ minWidth: 180 }}>{r.next_action ?? <span className="muted">No next step</span>}{r.next_action_date && <span className="sub">{fmtDate(String(r.next_action_date))}</span>}</td>
                <td>{r.owner ?? <span className="muted">Unassigned</span>}</td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Board({ cfg, rows }: { cfg: EntityCfg; rows: Row[] }) {
  const field = cfg.key === 'requests' ? 'status' : 'stage';
  const cols: [string, string][] = cfg.key === 'requests' ? REQUEST_STATUSES.map(([k, l]) => [k, l]) : PROJECT_STAGES.map(([k, l]) => [k, l]);
  const opts = cols;
  return (
    <div className="board" aria-label="Board">
      {cols.map(([k, l]) => {
        const items = rows.filter((r) => r[field] === k);
        return (
          <section className="col" key={k} aria-label={l}>
            <h3><span>{l}</span><span className="num">{items.length}</span></h3>
            {items.map((r) => (
              <div className="tile" key={String(r.id)}>
                <Link className="t-title" href={`/ops/${cfg.slug}/${r.id}`}>{cfg.key === 'requests' ? r.from_name : r.name}</Link>
                <span className="small muted">{cfg.key === 'requests' ? `${r.ref} · ${label(REQUEST_KINDS, String(r.kind))}` : `${r.county ?? ''}${r.owner ? ' · ' + r.owner : ''}`}</span>
                {cfg.key === 'requests' && r.priority ? <Prio p={r.priority as string} /> : null}
                <form action={moveAction.bind(null, cfg.slug, Number(r.id))}>
                  <select name="to" defaultValue={k} aria-label="Move to">{opts.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}</select>
                  <button className="btn sm">Move</button>
                </form>
              </div>
            ))}
            {items.length === 0 && <p className="tiny muted" style={{ padding: 6 }}>Nothing here</p>}
          </section>
        );
      })}
    </div>
  );
}

function Schedule({ rows, users }: { rows: Row[]; users: [string, string][] }) {
  if (rows.length === 0) return <div className="empty">Every open request has a next action date.</div>;
  return (
    <div className="stack">
      {rows.map((r) => (
        <form key={String(r.id)} action={scheduleAction.bind(null, Number(r.id))} className="card" style={{ marginTop: 0, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(180px,1.4fr) repeat(auto-fit,minmax(150px,1fr)) auto', alignItems: 'end' }}>
          <div><Link href={`/ops/requests/${r.id}`}><b>{r.from_name}</b></Link><div className="small muted">{r.ref} · <StatusPill status={String(r.status)} /></div></div>
          <div className="field"><label htmlFor={`o-${r.id}`}>Owner</label><select id={`o-${r.id}`} name="owner_id" className="select" defaultValue={String(r.owner_id ?? '')}><option value="">Unassigned</option>{users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor={`d-${r.id}`}>Next action date</label><input id={`d-${r.id}`} type="date" name="next_action_date" className="input" /></div>
          <div className="field"><label htmlFor={`a-${r.id}`}>Next action</label><input id={`a-${r.id}`} name="next_action" className="input" placeholder="Email, call, apply…" maxLength={300} /></div>
          <button className="btn primary sm">Save</button>
        </form>
      ))}
    </div>
  );
}
