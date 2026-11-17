import Link from 'next/link';
import { ExternalLink, Mail, Phone } from 'lucide-react';
import { all, get } from '@/lib/db';
import { fmtDate, fmtMoney, fmtRange, todayIso } from '@/lib/format';
import { label, PROGRAM_TYPES } from '@/lib/constants';
import { whereLabel } from '@/lib/crud';
import { deadlineNote, windowLabel, windowStatus } from '@/lib/programs';
import { lookedNote } from '@/lib/publish';
import { safeHref } from '@/lib/safe-url';
import { decideMatchAction, lookedAction } from '@/app/ops/actions';
import { CheckCard, HistoryCard, PublishCard } from './RecordParts';

type Row = Record<string, string | number | null>;

/** One funding program: who can get it, when, how much, which projects could use it, and whether it is still current. */
export async function ProgramView({ id, row }: { id: number; row: Row }) {
  const today = todayIso();
  const status = windowStatus({ window_start: row.window_start as string | null, window_end: row.window_end as string | null }, today);
  const note = deadlineNote({ window_start: row.window_start as string | null, window_end: row.window_end as string | null }, today);
  const looked = lookedNote(row.checked_at as string | null, today);
  const contact = row.contact_id ? await get<{ id: number; name: string; email: string | null; phone: string | null }>('SELECT id, name, email, phone FROM contacts WHERE id = ?', Number(row.contact_id)) : undefined;
  const matches = await all<{ id: number; status: string; reason: string; project_id: number; name: string; county: string | null; state: string | null }>(
    `SELECT m.id, m.status, m.reason, p.id project_id, p.name, p.county, p.state FROM matches m JOIN projects p ON p.id = m.project_id WHERE m.program_id = ? AND m.status != 'dismissed' AND p.archived = 0 ORDER BY (m.status = 'accepted') DESC, m.score DESC LIMIT 8`, id);
  const awards = await get<{ n: number; s: number | null; r: number }>('SELECT COUNT(*) n, SUM(amount_committed) s, COUNT(DISTINCT org_id) r FROM awards WHERE program_id = ?', id);
  const link = safeHref(row.url as string | null);

  return (
    <div className="detail-grid" style={{ marginTop: 4 }}>
      <div className="stack">
        <section className="card" style={{ marginTop: 0 }} aria-labelledby="facts">
          <div className="row" style={{ gap: 10 }}>
            <span className={`pill ${status === 'open' ? 'ok' : status === 'past' ? 'quiet' : status === 'upcoming' ? 'info' : 'info'}`}>{status === 'open' ? 'Open now' : status === 'past' ? 'Closed' : status === 'upcoming' ? 'Opens later' : 'Always open'}</span>
            {note && status !== 'past' && <span className="small muted">{note}</span>}
            <span className="pill quiet">{label(PROGRAM_TYPES, String(row.type))}</span>
          </div>
          <h2 id="facts" style={{ marginTop: 14 }}>The facts</h2>
          <dl className="kv-list" style={{ gridTemplateColumns: '170px 1fr', marginTop: 10 }}>
            <dt>Run by</dt><dd>{row.run_by ?? <span className="muted">Not set</span>}{row.funded_by ? <span className="muted"> · paid for by {row.funded_by}</span> : null}</dd>
            <dt>Pays for</dt><dd>{row.focus ?? <span className="muted">Not set</span>}</dd>
            <dt>How much</dt><dd>{fmtRange(row.award_min as number | null, row.award_max as number | null, row.award_text as string | null)}</dd>
            <dt>When you can apply</dt><dd>{windowLabel({ window_start: row.window_start as string | null, window_end: row.window_end as string | null })}</dd>
            <dt>Where</dt><dd>{whereLabel(String(row.scope), row.state as string | null, row.counties as string | null)}</dd>
            <dt>Who can apply</dt><dd>{row.eligibility ?? <span className="muted">Not set. The website needs this.</span>}</dd>
          </dl>
          <div className="row" style={{ marginTop: 14 }}>
            {link ? <a className="btn" href={link} target="_blank" rel="noopener noreferrer">Open the program page <ExternalLink size={15} aria-hidden /></a> : <span className="small muted">No program page link yet.</span>}
          </div>
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="looked">
          <h2 id="looked">Is this still current?</h2>
          <p style={{ margin: '8px 0', color: looked.stale ? 'var(--accent)' : undefined }}><b>{looked.text}.</b>{row.checked_at ? <span className="muted"> ({fmtDate(String(row.checked_at))})</span> : null}</p>
          <p className="small muted">Programs change their dates and amounts. Open the program page, compare, fix anything that is different, then press the button.</p>
          <form action={lookedAction.bind(null, id)} style={{ marginTop: 10 }}><button className="btn sm primary">I looked at the program page today</button></form>
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="projs">
          <h2 id="projs">Projects that could use it</h2>
          <p className="card-sub">Suggested because this program covers their place and pays for their kind of work.</p>
          {matches.length === 0 ? <p className="muted" style={{ marginTop: 10 }}>No projects suggested yet. <Link className="link" href="/ops/matches">Refresh suggestions</Link>.</p> : (
            <div style={{ marginTop: 6 }}>{matches.map((m) => (
              <div key={m.id} className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 260px' }}>
                  <Link href={`/ops/projects/${m.project_id}`}><b>{m.name}</b></Link>{m.status === 'accepted' && <span className="pill ok" style={{ marginLeft: 8 }}>Chosen</span>}
                  <div className="small muted">{[m.county, m.state].filter(Boolean).join(', ')}</div><div className="small">{m.reason}</div>
                </div>
                <div className="row">
                  {m.status !== 'accepted' && <form action={decideMatchAction.bind(null, m.id, 'accepted')}><button className="btn sm primary">Choose</button></form>}
                  <form action={decideMatchAction.bind(null, m.id, 'dismissed')}><button className="btn sm">Not a fit</button></form>
                </div>
              </div>))}</div>
          )}
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="aw">
          <h2 id="aw">Money it has given out</h2>
          {awards && awards.n > 0 ? <p style={{ marginTop: 8 }}><b className="num">{awards.n}</b> awards to <b className="num">{awards.r}</b> groups, about <b>{fmtMoney(awards.s ?? 0, { compact: true })}</b> promised. This is history, not money you can apply for now.</p> : <p className="muted" style={{ marginTop: 8 }}>No awards on record yet.</p>}
        </section>

        <HistoryCard slug="funding" entity="programs" id={id} />
      </div>

      <div className="stack">
        <PublishCard table="programs" id={id} row={row} />
        <CheckCard slug="funding" id={id} row={row} />
        {contact && (
          <section className="card" style={{ marginTop: 0 }} aria-labelledby="call">
            <h2 id="call">Who to call</h2>
            <p style={{ margin: '8px 0' }}><Link className="link" href={`/ops/contacts/${contact.id}`}><b>{contact.name}</b></Link></p>
            <div className="row">{contact.email && <a className="btn sm" href={`mailto:${contact.email}`}><Mail size={14} aria-hidden /> Email</a>}{contact.phone && <a className="btn sm" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}><Phone size={14} aria-hidden /> Call</a>}</div>
          </section>
        )}
      </div>
    </div>
  );
}
