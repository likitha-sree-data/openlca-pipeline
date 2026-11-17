import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { all, get } from '@/lib/db';
import { fmtMoney, fmtRange, todayIso } from '@/lib/format';
import { label, PRECISIONS, PROJECT_CATEGORIES, PROJECT_STAGES } from '@/lib/constants';
import { decideMatchAction, moveAction } from '@/app/ops/actions';
import { windowLabel, windowStatus } from '@/lib/programs';
import { StatusPill } from '@/components/ops/ui';
import { CheckCard, HistoryCard, PublishCard } from './RecordParts';

type Row = Record<string, string | number | null>;

/** One project: what it is, where it stands, what money could pay for it, and whether the public can see it. */
export function ProjectView({ id, row }: { id: number; row: Row }) {
  const today = todayIso();
  const owner = row.owner_org_id ? get<{ id: number; name: string }>('SELECT id, name FROM organizations WHERE id = ?', Number(row.owner_org_id)) : undefined;
  const people = owner ? all<{ id: number; name: string; title: string | null; email: string | null; phone: string | null; do_not_contact: number }>('SELECT id, name, title, email, phone, do_not_contact FROM contacts WHERE org_id = ? AND archived = 0 ORDER BY name LIMIT 6', owner.id) : [];
  const matches = all<{ id: number; status: string; reason: string; program_id: number; name: string; run_by: string | null; window_start: string | null; window_end: string | null; award_min: number | null; award_max: number | null; award_text: string | null }>(
    `SELECT m.id, m.status, m.reason, pr.id program_id, pr.name, pr.run_by, pr.window_start, pr.window_end, pr.award_min, pr.award_max, pr.award_text FROM matches m JOIN programs pr ON pr.id = m.program_id
     WHERE m.project_id = ? AND m.status != 'dismissed' ORDER BY (m.status = 'accepted') DESC, m.score DESC LIMIT 6`, id);
  const awards = all<{ id: number; program: string | null; amount_committed: number | null; amount_disbursed: number | null; year: number | null }>('SELECT a.id, pr.name program, a.amount_committed, a.amount_disbursed, a.year FROM awards a LEFT JOIN programs pr ON pr.id = a.program_id WHERE a.project_id = ?', id);
  const requests = all<{ id: number; ref: string; from_name: string; status: string }>('SELECT id, ref, from_name, status FROM requests WHERE project_id = ? ORDER BY id DESC LIMIT 6', id);

  return (
    <div className="detail-grid" style={{ marginTop: 4 }}>
      <div className="stack">
        <section className="card" style={{ marginTop: 0 }} aria-labelledby="what">
          <h2 id="what">What it is</h2>
          {row.description ? <p style={{ margin: '10px 0', fontSize: 17, whiteSpace: 'pre-wrap' }}>{String(row.description)}</p> : <p className="muted" style={{ margin: '10px 0' }}>No description yet. The website needs one before it can show this.</p>}
          <dl className="kv-list" style={{ gridTemplateColumns: '170px 1fr' }}>
            <dt>Kind of work</dt><dd>{label(PROJECT_CATEGORIES, String(row.category))}</dd>
            <dt>Place</dt><dd>{[row.county, row.state].filter(Boolean).join(', ') || <span className="muted">Not set</span>}</dd>
            <dt>How exact the location is</dt><dd>{row.lat != null ? label(PRECISIONS, String(row.location_precision ?? '')) || 'On the map' : <span className="muted">Not on the map</span>}</dd>
            {row.acres != null && <><dt>Acres</dt><dd>{String(row.acres)}</dd></>}
            {owner && <><dt>Run by</dt><dd><Link className="link" href={`/ops/organizations/${owner.id}`}>{owner.name}</Link></dd></>}
          </dl>
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="money">
          <h2 id="money">Money</h2>
          <dl className="kv-list" style={{ gridTemplateColumns: '170px 1fr', marginTop: 10 }}>
            <dt>Asking for</dt><dd>{row.requested_amount ? fmtMoney(Number(row.requested_amount)) : <span className="muted">Not stated</span>}</dd>
            <dt>Budget</dt><dd>{row.budget_amount ? fmtMoney(Number(row.budget_amount)) : <span className="muted">Not stated</span>}</dd>
            <dt>Needs</dt><dd>{row.needs ?? <span className="muted">Not stated</span>}</dd>
          </dl>
          {awards.length > 0 && (
            <div style={{ marginTop: 12 }}><h3 style={{ fontSize: 15 }}>Money it has been given</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>{awards.map((a) => <li key={a.id} className="small" style={{ padding: '4px 0' }}>{a.program ?? 'An award'}{a.year ? ` (${a.year})` : ''}: promised <b>{fmtMoney(a.amount_committed)}</b>{a.amount_disbursed ? `, paid out ${fmtMoney(a.amount_disbursed)}` : ''}</li>)}</ul></div>
          )}
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="progs">
          <h2 id="progs">Programs that could pay for it</h2>
          <p className="card-sub">Suggested because they cover this place and pay for this kind of work. A person decides.</p>
          {matches.length === 0 ? <p className="muted" style={{ marginTop: 10 }}>No suggestions yet. <Link className="link" href="/ops/matches">Refresh suggestions</Link> to look again.</p> : (
            <div style={{ marginTop: 6 }}>{matches.map((m) => (
              <div key={m.id} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 280px' }}>
                    <Link href={`/ops/funding/${m.program_id}`}><b>{m.name}</b></Link>{m.status === 'accepted' && <span className="pill ok" style={{ marginLeft: 8 }}>Chosen</span>}
                    <div className="small muted">{m.run_by} · {fmtRange(m.award_min, m.award_max, m.award_text)} · {windowStatus(m, today) === 'open' ? windowLabel(m) : 'Always open'}</div>
                    <div className="small" style={{ marginTop: 4 }}>{m.reason}</div>
                  </div>
                  <div className="row">
                    {m.status !== 'accepted' && <form action={decideMatchAction.bind(null, m.id, 'accepted')}><button className="btn sm primary">Choose</button></form>}
                    <form action={decideMatchAction.bind(null, m.id, 'dismissed')}><button className="btn sm">Not a fit</button></form>
                  </div>
                </div>
              </div>))}</div>
          )}
        </section>

        {(people.length > 0 || requests.length > 0) && (
          <section className="card" style={{ marginTop: 0 }} aria-labelledby="ppl">
            <h2 id="ppl">People and requests</h2>
            {people.map((c) => (
              <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <span><Link className="link" href={`/ops/contacts/${c.id}`}><b>{c.name}</b></Link>{c.title && <span className="small muted"> · {c.title}</span>}</span>
                {!c.do_not_contact && <span className="row">{c.email && <a className="btn sm" href={`mailto:${c.email}`}><Mail size={14} aria-hidden /> Email</a>}{c.phone && <a className="btn sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Phone size={14} aria-hidden /> Call</a>}</span>}
              </div>))}
            {requests.map((r) => <div key={r.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line)' }}><Link className="link" href={`/ops/requests/${r.id}`}>{r.from_name} <span className="muted small">{r.ref}</span></Link><StatusPill status={r.status} /></div>)}
          </section>
        )}
        <HistoryCard slug="projects" entity="projects" id={id} />
      </div>

      <div className="stack">
        <section className="card" style={{ marginTop: 0 }} aria-labelledby="stand">
          <h2 id="stand">Where it stands</h2>
          <p style={{ margin: '8px 0 10px' }}><span className={`pill ${row.stage === 'complete' ? 'ok' : row.stage === 'seeking_funding' ? 'new' : 'info'}`}>{label(PROJECT_STAGES, String(row.stage))}</span></p>
          <div className="row" style={{ gap: 6 }} role="group" aria-label="Change where it stands">
            {PROJECT_STAGES.filter(([v]) => v !== row.stage).map(([v, l]) => <form key={v} action={moveAction.bind(null, 'projects', id)}><input type="hidden" name="to" value={v} /><button className="btn sm">{l}</button></form>)}
          </div>
        </section>
        <PublishCard table="projects" id={id} row={row} />
        <CheckCard slug="projects" id={id} row={row} />
      </div>
    </div>
  );
}
