import type { Metadata } from 'next';
import Link from 'next/link';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead } from '@/components/ops/ui';
import { RefPicker } from '@/components/ops/RefPicker';
import { all } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { dataTiles, scorecard, sourcesTable, type MetricStatus } from '@/lib/pilot';
import { fmtDate, fmtDateTime, fmtInt } from '@/lib/format';
import { userOptions } from '@/lib/crud';
import {
  pilotAcceptAction, pilotAddPersonAction, pilotAdvanceAction, pilotAskAction, pilotBriefAction, pilotCapacityAction, pilotConfirmAskAction,
  pilotDemoAction, pilotNotesAction, pilotRemovePersonAction, pilotReviewAction,
} from '@/app/ops/actions';

export const metadata: Metadata = { title: 'Pilot scorecard' };

const statusClass = (s: MetricStatus) => (s === 'Met' ? 'ok' : s === 'Below target' ? 'warn' : s === 'In progress' ? 'info' : 'quiet');
const ptDay = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date(iso));
const ptDayOnly = (iso: string) => new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date(iso));
const ptFull = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' }).format(new Date(iso)).replace(',', '').replace(/(\w{3} \d+) /, '$1, ');

export default async function PilotPage() {
  const me = await requireUser();
  const sc = await scorecard();
  if (!sc) return <OpsPage section="Pilot"><div className="empty">No pilot is configured.</div></OpsPage>;
  const { pilot, cards } = sc;
  const users = await userOptions();
  const first = (n: string) => n.split(' ')[0];

  return (
    <OpsPage section="Pilot">
      <PageHead title="Pilot scorecard">
        {ptDay(pilot.start_date)} to {ptDayOnly(pilot.deadline)}. Everyone&apos;s targets and progress on one page. Numbers come from what is logged, nothing is typed in by hand
      </PageHead>
      <div className="row" style={{ gap: 22, margin: '18px 0 8px' }}>
        <span><b style={{ fontSize: 22 }}>{sc.ended ? `Ended ${sc.daysSinceEnd}d ago` : sc.daysLeft}</b>{sc.ended ? '' : ' days left'}</span>
        <span className="small">Deadline {ptFull(pilot.deadline)}</span>
        {pilot.checkpoint && <span className="small">Checkpoint {ptFull(pilot.checkpoint)}</span>}
        <span className="small">Last activity {sc.lastActivity ? fmtDateTime(sc.lastActivity) : 'none yet'}</span>
        <span style={{ marginLeft: 'auto' }}><Link className="link small" href="/data">Public data page</Link></span>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {cards.map((m) => (
          <section key={m.user_id} className={`card member ${m.status === 'proposed' ? 'proposed' : ''}`} aria-label={m.name} style={{ marginTop: 0 }}>
            <div className="card-head" style={{ alignItems: 'center' }}>
              <h2>{m.name}{m.user_id === me.id && <span className="pill quiet" style={{ marginLeft: 10 }}>You</span>}</h2>
              <span className={`pill ${m.status === 'accepted' ? 'ok' : m.status === 'declined' ? 'bad' : 'quiet'}`}>{m.status === 'accepted' ? 'Accepted' : m.status === 'declined' ? 'Declined' : 'Awaiting acceptance'}</span>
            </div>
            <p style={{ color: 'var(--ink-2)', margin: '6px 0 12px' }}>{m.focus}</p>
            {m.status === 'proposed' && m.user_id === me.id && (
              <div className="row" style={{ margin: '8px 0 12px' }}>
                <span className="small">This is proposed for you. Accept it or decline it:</span>
                <form action={pilotAcceptAction.bind(null, m.user_id, true)}><button className="btn sm primary">Accept</button></form>
                <form action={pilotAcceptAction.bind(null, m.user_id, false)}><button className="btn sm">Decline</button></form>
              </div>
            )}
            <div>
              {m.metrics.map((x) => (
                <div className="metric" key={x.key} style={{ borderTop: '1px solid var(--line)' }}>
                  <div><b>{x.label}</b><div style={{ marginTop: 6 }}><span className={`pill ${statusClass(x.status)}`}>{x.status}</span></div></div>
                  <div><div className="v">{fmtInt(x.value)} <small>/ {x.target}</small></div><div className="to">{x.toGo}</div></div>
                </div>
              ))}
            </div>
            {m.notes && <p className="small muted" style={{ marginTop: 6 }}>{m.notes}</p>}
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <span className="small muted">Capacity {m.capacity_hours ? `${m.capacity_hours} h/week` : 'not confirmed'}</span>
              <details><summary className="link small" style={{ cursor: 'pointer' }}>Edit</summary>
                <form action={pilotCapacityAction.bind(null, m.user_id)} className="row" style={{ marginTop: 8 }}>
                  <label className="sr-only" htmlFor={`cap-${m.user_id}`}>Hours per week</label>
                  <input id={`cap-${m.user_id}`} name="capacity" type="number" min="1" max="80" step="0.5" defaultValue={m.capacity_hours ?? ''} className="input" style={{ width: 110 }} />
                  <button className="btn sm">Save</button>
                </form>
              </details>
            </div>
          </section>
        ))}

        {cards.filter((m) => m.lane === 'outreach').map((m) => <People key={m.user_id} name={first(m.name)} userId={m.user_id} />)}
        {cards.filter((m) => m.lane === 'data').map((m) => <DataCard key={m.user_id} name={first(m.name)} since={pilot.start_date} users={users} />)}
        {cards.filter((m) => m.lane === 'validation').map((m) => <Validation key={m.user_id} name={first(m.name)} userId={m.user_id} users={users} />)}

        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 18 }}>{pilot.review_title ?? 'Review'}</summary>
          <form action={pilotNotesAction} className="stack" style={{ marginTop: 14 }}>
            <label className="sr-only" htmlFor="notes">Review notes</label>
            <textarea id="notes" name="notes" className="textarea" defaultValue={pilot.review_notes ?? ''} placeholder="What we decided together: keep, change, drop, next target." maxLength={6000} />
            <button className="btn sm" style={{ justifySelf: 'start' }}>Save notes</button>
          </form>
        </details>
      </div>
    </OpsPage>
  );
}

async function People({ name, userId }: { name: string; userId: number }) {
  const people = await all<{ id: number; contact_id: number; cname: string; org: string | null; email: string | null; phone: string | null; qualified_at: string | null; contacted_at: string | null; followup_at: string | null; replied_at: string | null; meeting_at: string | null }>(
    `SELECT p.id, p.contact_id, c.name cname, o.name org, c.email, c.phone, p.qualified_at, p.contacted_at, p.followup_at, p.replied_at, p.meeting_at
     FROM pilot_people p JOIN contacts c ON c.id = p.contact_id LEFT JOIN organizations o ON o.id = c.org_id WHERE p.added_by = ? ORDER BY p.id`, userId);
  const qualified = people.filter((p) => p.qualified_at).length;
  const needDetails = people.filter((p) => !p.email && !p.phone).length;
  return (
    <section className="card" style={{ marginTop: 0 }} aria-labelledby={`pp-${userId}`}>
      <div className="card-head"><h2 id={`pp-${userId}`}>People {name} is reaching</h2><span className="small muted">{people.length} people · {qualified} qualified · {needDetails} need details</span></div>
      <form action={pilotAddPersonAction} className="row" style={{ margin: '12px 0' }}>
        <div style={{ minWidth: 260, flex: 1, maxWidth: 360 }}><RefPicker name="contact_id" kind="contacts" /></div>
        <button className="btn sm">Add person</button>
        <Link href="/ops/imports" className="btn sm">Upload spreadsheet</Link>
        <Link href="/ops/contacts" className="link small" style={{ marginLeft: 'auto' }}>All contacts</Link>
      </form>
      {people.length === 0 ? <div className="empty">No one yet. Add a person or upload the spreadsheet.</div> : (
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Person</th><th>Qualified</th><th>Contacted</th><th>Follow-up</th><th>Replied</th><th>Meeting</th><th /></tr></thead>
          <tbody>{people.map((p) => (
            <tr key={p.id}>
              <td className="name"><Link href={`/ops/contacts/${p.contact_id}`}>{p.cname}</Link><span className="sub">{p.org ?? ''}</span></td>
              {(['qualified', 'contacted', 'followup', 'replied', 'meeting'] as const).map((k) => {
                const v = p[`${k === 'followup' ? 'followup' : k}_at` as 'qualified_at'];
                return <td key={k}>{v ? <span className="pill ok">{fmtDate(v)}</span> : <form action={pilotAdvanceAction.bind(null, p.id, k)}><button className="btn sm">Mark</button></form>}</td>;
              })}
              <td><form action={pilotRemovePersonAction.bind(null, p.id)}><button className="btn sm ghost" aria-label={`Remove ${p.cname}`}>Remove</button></form></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  );
}

async function DataCard({ name, since, users }: { name: string; since: string; users: [string, string][] }) {
  const t = await dataTiles(since);
  const rows = await sourcesTable(since);
  const demos = await all<{ id: number; project: string | null; program: string | null; created_at: string }>(
    `SELECT d.id, p.name project, pr.name program, d.created_at FROM workflow_demos d LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN programs pr ON pr.id = d.program_id ORDER BY d.id DESC LIMIT 3`);
  return (
    <>
      <section className="card" style={{ marginTop: 0 }} aria-labelledby="dp">
        <div className="card-head"><h2 id="dp">Data {name} is pulling in</h2><span className="row small"><Link className="link" href="/ops/sources">All sources</Link><Link className="link" href="/ops/map">Map</Link><Link className="link" href="/data">Public page</Link></span></div>
        <div className="tiles" style={{ margin: '14px 0' }}>
          <div className="stat"><b className="num">{t.fetched}</b><span>Sources fetched this week</span><div className="small muted">of {t.sourcesTotal} public sources</div></div>
          <div className="stat"><b className="num">{fmtInt(t.newRecords)}</b><span>New records this week</span><div className="small muted">{fmtInt(t.orgs)} orgs · {fmtInt(t.projects)} projects · {fmtInt(t.awards)} awards · {fmtInt(t.programs)} programs</div></div>
          <div className="stat"><b className="num">{fmtInt(t.orgsWithSource)}</b><span>Organizations with a source</span><div className="small muted">whole record</div></div>
          <div className="stat"><b className="num">{fmtInt(t.projectsWithSource)}</b><span>Projects with a source</span><div className="small muted">whole record</div></div>
          <div className="stat"><b className="num">{fmtInt(t.awardsTotal)}</b><span>Awards on record</span><div className="small muted">historical, not available funding</div></div>
        </div>
        <div className="table-wrap"><table className="t"><thead><tr><th>Source</th><th>Fetched</th><th>Rows it feeds</th></tr></thead><tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="muted">No source has been fetched since the pilot started. Run <code>npm run ingest</code> or import a file.</td></tr>}
          {rows.map((s) => { const n = s.organizations + s.projects + s.programs + s.awards; return (
            <tr key={s.id}><td>{s.name}{s.url && <span className="sub">{s.url}</span>}</td><td className="nowrap">{fmtDate(s.last_fetched_at)}</td><td className="small">{n === 0 ? <span className="muted">reference only</span> : [s.organizations && `${s.organizations} organizations`, s.projects && `${s.projects} projects`, s.programs && `${s.programs} funding programs`, s.awards && `${s.awards} funding awards`].filter(Boolean).join(', ')}</td></tr>); })}
        </tbody></table></div>
      </section>
      <section className="card" style={{ marginTop: 0 }} aria-labelledby="wd">
        <h2 id="wd">Workflow demo</h2>
        <p style={{ margin: '6px 0' }}>Pick a project, a plausible funding option, say what is missing, set the next step and owner, attach the demo.</p>
        {demos.length === 0 ? <p className="muted small">Not started.</p> : demos.map((d) => <p key={d.id} className="small">Recorded {fmtDate(d.created_at)}: {d.project} with {d.program}</p>)}
        <details style={{ marginTop: 10 }}><summary className="btn sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>Record the demo ▾</summary>
          <form action={pilotDemoAction} className="stack" style={{ marginTop: 14 }}>
            <div className="form-grid">
              <div className="field"><label htmlFor="d-project">Project</label><RefPicker name="project_id" id="d-project" kind="projects" /></div>
              <div className="field"><label htmlFor="d-program">Funding option</label><RefPicker name="program_id" id="d-program" kind="programs" /></div>
              <div className="field wide"><label htmlFor="d-missing">What is missing</label><textarea id="d-missing" name="missing" className="textarea" style={{ minHeight: 70 }} required /></div>
              <div className="field"><label htmlFor="d-next">Next step</label><input id="d-next" name="next_step" className="input" required /></div>
              <div className="field"><label htmlFor="d-owner">Owner</label><select id="d-owner" name="next_owner_id" className="select" required><option value="">Choose</option>{users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div className="field wide"><label htmlFor="d-url">Link to the demo (optional)</label><input id="d-url" name="attachment_url" type="url" className="input" placeholder="https://" /></div>
            </div>
            <button className="btn primary sm" style={{ justifySelf: 'start' }}>Save demo</button>
          </form>
        </details>
      </section>
    </>
  );
}

async function Validation({ name, userId, users }: { name: string; userId: number; users: [string, string][] }) {
  const queue = await all<{ slug: string; id: number; name: string; source: string | null }>(
    `SELECT * FROM (
       SELECT 'projects' slug, p.id, p.name, s.name source FROM projects p LEFT JOIN sources s ON s.id = p.source_id WHERE p.verification = 'unverified' AND p.archived = 0
       UNION ALL SELECT 'organizations', o.id, o.name, s.name FROM organizations o LEFT JOIN sources s ON s.id = o.source_id WHERE o.verification = 'unverified' AND o.archived = 0 AND o.published = 1
       UNION ALL SELECT 'funding', pr.id, pr.name, s.name FROM programs pr LEFT JOIN sources s ON s.id = pr.source_id WHERE pr.verification = 'unverified' AND pr.archived = 0 AND pr.published = 1
     ) AS q ORDER BY source IS NULL, name LIMIT 8`);
  const reviewed = await all<{ id: number; entity: string; entity_id: number; outcome: string; created_at: string; label: string | null }>(
    `SELECT r.id, r.entity, r.entity_id, r.outcome, r.created_at,
       COALESCE((SELECT name FROM projects WHERE id = r.entity_id AND r.entity = 'projects'), (SELECT name FROM organizations WHERE id = r.entity_id AND r.entity = 'organizations'),
                (SELECT name FROM programs WHERE id = r.entity_id AND r.entity = 'programs'), (SELECT name FROM contacts WHERE id = r.entity_id AND r.entity = 'contacts')) label
     FROM record_reviews r WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 10`, userId);
  const briefs = await all<{ id: number; title: string; project: string | null; created_at: string; complete: number }>(
    `SELECT b.id, b.title, p.name project, b.created_at, (b.evidence IS NOT NULL AND b.gaps IS NOT NULL AND b.next_step IS NOT NULL AND b.next_owner_id IS NOT NULL) complete FROM briefs b LEFT JOIN projects p ON p.id = b.project_id WHERE b.author_id = ? ORDER BY b.id DESC LIMIT 10`, userId);
  const asks = await all<{ id: number; stakeholder: string; asked_at: string; confirmed_at: string | null }>(`SELECT id, stakeholder, asked_at, confirmed_at FROM validation_asks WHERE user_id = ? ORDER BY id DESC LIMIT 10`, userId);
  const slugOf = (e: string) => (e === 'programs' ? 'funding' : e);
  return (
    <section className="card" style={{ marginTop: 0 }} aria-labelledby="vr">
      <div className="card-head"><h2 id="vr">Records {name} is checking, and briefs</h2></div>
      <p className="small muted">Source reviewed means a person checked it. External confirmation needs a named stakeholder. Validation asks are logged on a person above.</p>

      <div className="card-head" style={{ marginTop: 18 }}><h3 style={{ fontSize: 16 }}>Reviewed records ({reviewed.length})</h3></div>
      {reviewed.length === 0 ? <p className="muted small">None yet.</p> : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{reviewed.map((r) => <li key={r.id} className="small" style={{ padding: '4px 0' }}><Link className="link" href={`/ops/${slugOf(r.entity)}/${r.entity_id}`}>{r.label ?? `#${r.entity_id}`}</Link> · {r.outcome} · {fmtDate(r.created_at)}</li>)}</ul>}
      <details style={{ marginTop: 10 }}><summary className="btn sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>Review a record ▾</summary>
        <div style={{ marginTop: 12 }} className="stack">
          {queue.length === 0 && <p className="muted small">Nothing is waiting for review.</p>}
          {queue.map((q) => (
            <form key={q.slug + q.id} action={pilotReviewAction} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <input type="hidden" name="slug" value={q.slug} /><input type="hidden" name="id" value={q.id} />
              <span><Link className="link" href={`/ops/${q.slug}/${q.id}`}>{q.name}</Link><span className="small muted"> · {q.source ?? 'no source'}</span></span>
              <span className="row"><select name="outcome" className="select" style={{ width: 'auto', minHeight: 34 }} aria-label="Outcome"><option value="confirmed">Matches source</option><option value="corrected">Corrected</option></select><button className="btn sm">Mark checked</button></span>
            </form>
          ))}
        </div>
      </details>

      <div className="card-head" style={{ marginTop: 22 }}><h3 style={{ fontSize: 16 }}>Opportunity briefs ({briefs.length})</h3></div>
      {briefs.length === 0 ? <p className="muted small">None yet. A complete brief has evidence, the gaps, and a next step with an owner.</p> : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{briefs.map((b) => <li key={b.id} className="small" style={{ padding: '4px 0' }}><b>{b.title}</b>{b.project ? ` · ${b.project}` : ''} · {b.complete ? 'complete' : 'incomplete'} · {fmtDate(b.created_at)}</li>)}</ul>}
      <details style={{ marginTop: 10 }}><summary className="btn sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>New brief ▾</summary>
        <form action={pilotBriefAction} className="stack" style={{ marginTop: 12 }}>
          <div className="form-grid">
            <div className="field wide"><label htmlFor="b-title">Title</label><input id="b-title" name="title" className="input" required maxLength={200} /></div>
            <div className="field"><label htmlFor="b-project">Project</label><RefPicker name="project_id" id="b-project" kind="projects" /></div>
            <div className="field"><label htmlFor="b-program">Program</label><RefPicker name="program_id" id="b-program" kind="programs" /></div>
            <div className="field wide"><label htmlFor="b-evidence">Evidence</label><textarea id="b-evidence" name="evidence" className="textarea" style={{ minHeight: 80 }} /></div>
            <div className="field wide"><label htmlFor="b-gaps">The gaps</label><textarea id="b-gaps" name="gaps" className="textarea" style={{ minHeight: 70 }} /></div>
            <div className="field"><label htmlFor="b-next">Next step</label><input id="b-next" name="next_step" className="input" /></div>
            <div className="field"><label htmlFor="b-owner">Owner</label><select id="b-owner" name="next_owner_id" className="select"><option value="">Choose</option>{users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <button className="btn primary sm" style={{ justifySelf: 'start' }}>Save brief</button>
        </form>
      </details>

      <div className="card-head" style={{ marginTop: 22 }}><h3 style={{ fontSize: 16 }}>Validation asks ({asks.length})</h3></div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{asks.map((a) => (
        <li key={a.id} className="row small" style={{ padding: '6px 0', justifyContent: 'space-between' }}>
          <span><b>{a.stakeholder}</b> · asked {fmtDate(a.asked_at)}</span>
          {a.confirmed_at ? <span className="pill ok">Confirmed {fmtDate(a.confirmed_at)}</span> : (
            <form action={pilotConfirmAskAction.bind(null, a.id)} className="row"><input name="response" className="input" style={{ minHeight: 34, width: 200 }} placeholder="What they said" aria-label="Response" /><button className="btn sm">Mark confirmed</button></form>
          )}
        </li>))}</ul>
      <form action={pilotAskAction} className="row" style={{ marginTop: 10 }}>
        <label className="sr-only" htmlFor="stk">Stakeholder</label>
        <input id="stk" name="stakeholder" className="input" style={{ maxWidth: 320 }} placeholder="Named stakeholder, e.g. a program officer" required maxLength={200} />
        <button className="btn sm">Log a validation ask</button>
      </form>
    </section>
  );
}
