import type { Metadata } from 'next';
import Link from 'next/link';
import { OpsPage } from '@/components/ops/Shell';
import { ArrowLink, PageHead, SplitOf, StatusPill, VerifPill } from '@/components/ops/ui';
import { overview } from '@/lib/ops-stats';
import { fmtDate, fmtInt, fmtRange, todayIso } from '@/lib/format';
import { label, PROGRAM_TYPES, REQUEST_KINDS } from '@/lib/constants';

export const metadata: Metadata = { title: 'Overview' };

export default function Overview() {
  const o = overview();
  const c = o.cards;
  const today = todayIso();
  const cards: [string, React.ReactNode, React.ReactNode, string, boolean?][] = [
    ['Open requests', c.openRequests.total, <SplitOf key="a" s={c.openRequests} />, 'Requests of any kind not yet closed'],
    ['Projects', c.projects.total, <SplitOf key="b" s={c.projects} />, 'All projects, any stage or publication status'],
    ['Organizations', c.organizations.total, <SplitOf key="c" s={c.organizations} />, 'All organizations, any type or publication status'],
    ['Contacts', c.contacts.total, <SplitOf key="d" s={c.contacts} />, 'All contacts, private to operators'],
    ['Deadlines in 90 days', c.deadlines.total, <SplitOf key="e" s={c.deadlines} />, 'Funding programs with a deadline from today through the next 90 days'],
    ['Open verification issues', c.issues, null, 'Data quality issues still open, on any record'],
  ];
  return (
    <OpsPage section="Overview">
      <PageHead title="Overview">Follow-ups, waiting requests and funding deadlines. Every count shows its verified, unverified and demo split</PageHead>
      <div className="statrow" role="list">
        {cards.map(([k, n, split, d]) => (
          <div className="s" role="listitem" key={k}>
            <div className="k">{k}</div>
            <div className="n">{fmtInt(Number(n))}</div>
            {split}
            {k === 'Open verification issues' && <div className="d">Issues sit on records; they carry no label</div>}
            <div className="d">{d}</div>
          </div>
        ))}
      </div>

      <div className="stack" style={{ marginTop: 20 }}>
        <section className="card" aria-labelledby="followups">
          <div className="card-head"><h2 id="followups">Follow-ups due</h2><ArrowLink href="/ops/requests">All requests</ArrowLink></div>
          <p className="card-sub">Next actions and open tasks due within 14 days or overdue</p>
          {o.followups.noDate.total > 0 && (
            <div className="row" style={{ justifyContent: 'space-between', margin: '18px 0 8px', gap: 24 }}>
              <div className="row" style={{ gap: 16 }}>
                <span className="kpi-amber" style={{ fontSize: 34, fontWeight: 700 }}>{o.followups.noDate.total}</span>
                <div><b>Open requests with no next action date</b><div><SplitOf s={o.followups.noDate} /></div></div>
              </div>
              <Link href="/ops/requests?needs=schedule" className="link" style={{ color: 'var(--accent)' }}>Give each an owner and a date →</Link>
            </div>
          )}
          {o.followups.due.length === 0 ? <p className="muted" style={{ margin: '14px 0 6px' }}>Nothing is due in the next 14 days. Next to plan:</p> : (
            <div style={{ marginTop: 14 }}>{o.followups.due.map((r) => (
              <div className="listrow" key={r.id}><span className="ref">{r.ref}</span><Link href={`/ops/requests/${r.id}`}><b>{r.from_name}</b><span className="meta">{r.next_action ?? 'Follow up'} · due {fmtDate(r.next_action_date)}</span></Link><StatusPill status={r.status} /><span className="muted">{r.owner ?? 'Unassigned'}</span></div>
            ))}</div>
          )}
          {o.followups.nextToPlan.map((r) => (
            <div className="listrow" key={r.id}>
              <span className="ref">{r.ref}</span>
              <Link href={`/ops/requests/${r.id}`}><b>{r.from_name}</b><span className="meta">{label(REQUEST_KINDS, r.kind)} · received {fmtDate(r.received_at)}</span></Link>
              <StatusPill status={r.status} /><span className="muted">{r.owner ?? 'Unassigned'}</span>
            </div>
          ))}
        </section>

        <section className="card" aria-labelledby="bystatus">
          <div className="card-head"><h2 id="bystatus">Requests by status</h2><ArrowLink href="/ops/requests?view=board">Open board</ArrowLink></div>
          <p className="card-sub">All requests, closed included</p>
          <div style={{ marginTop: 14 }}>
            {o.byStatus.rows.map((r) => <div key={r.key} className="row" style={{ justifyContent: 'space-between', padding: '8px 0' }}><Link href={`/ops/requests?tab=${r.key === 'qualified' ? 'conversation' : r.key === 'matching' ? 'progress' : r.key === 'intro_made' ? 'intro' : r.key === 'needs_info' ? 'new' : r.key}`}>{r.label}</Link><b className="num">{r.n}</b></div>)}
          </div>
          <div className="row" style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 14, gap: 18 }}><b>{o.byStatus.split.total} requests</b><SplitOf s={o.byStatus.split} /></div>
        </section>

        <section className="card" aria-labelledby="deadlines">
          <div className="card-head"><h2 id="deadlines">Upcoming deadlines</h2><ArrowLink href="/ops/funding">All programs</ArrowLink></div>
          <p className="card-sub">Funding programs closing in the next 90 days</p>
          {o.upcoming.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No program closes in the next 90 days.</p>}
          {o.upcoming.map((p) => (
            <div key={p.id} className="row" style={{ padding: '14px 0', gap: 18, alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center', minWidth: 48 }}><b className="num" style={{ fontSize: 20, display: 'block' }}>{p.days}</b><span className="small muted">days</span></div>
              <div style={{ flex: 1 }}><Link href={`/ops/funding/${p.id}`}><b>{p.name}</b></Link><div className="small muted">{label(PROGRAM_TYPES, p.type)} · {p.run_by} · {fmtRange(p.award_min, p.award_max, p.award_text)}</div></div>
              <VerifPill v={p.verification} />
            </div>
          ))}
        </section>

        <section className="card" aria-labelledby="aging">
          <div className="card-head"><h2 id="aging">Requests aging</h2><ArrowLink href="/ops/requests?tab=new">All new</ArrowLink></div>
          <p className="card-sub">New requests nobody has moved for more than 7 days</p>
          <div className="row" style={{ gap: 20, margin: '12px 0' }}><span className="kpi-amber" style={{ fontSize: 34, fontWeight: 700 }}>{o.aging.split.total}</span><SplitOf s={o.aging.split} /></div>
          {o.aging.rows.map((r) => <div className="listrow" key={r.id} style={{ gridTemplateColumns: '110px 1fr auto' }}><span className="ref">{r.ref}</span><Link href={`/ops/requests/${r.id}`}>{r.from_name}</Link><span className="muted">{r.days}d</span></div>)}
        </section>

        <section className="card" aria-labelledby="vq">
          <div className="card-head"><h2 id="vq">Verification queue</h2><ArrowLink href="/ops/data-quality">Review</ArrowLink></div>
          <p className="card-sub">Open data quality issues and unchecked records</p>
          <div className="row" style={{ gap: 10, margin: '12px 0', paddingBottom: 12, borderBottom: '1px solid var(--line)' }}><b className="num" style={{ fontSize: 30 }}>{o.queue.openIssues}</b><span className="muted">open issues</span></div>
          <p className="small"><b className="num">{fmtInt(o.queue.uncheckedTotal)}</b> records not yet checked against a source</p>
          <div style={{ marginTop: 8 }}>
            {Object.entries(o.queue.rows).map(([k, v]) => <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '7px 0 7px 12px' }}><span>{k}</span><span><b className="num">{fmtInt(v.unchecked)}</b> <span className="muted">of {fmtInt(v.total)}</span></span></div>)}
          </div>
        </section>
      </div>
      <p className="tiny muted" style={{ marginTop: 14 }}>As of {fmtDate(today)}.</p>
    </OpsPage>
  );
}
