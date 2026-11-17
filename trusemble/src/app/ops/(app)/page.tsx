import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { OpsPage } from '@/components/ops/Shell';
import { StatusPill } from '@/components/ops/ui';
import { requireUser } from '@/lib/auth';
import { needsYou, checkedShare } from '@/lib/today';
import { overview } from '@/lib/ops-stats';
import { checkedByUserToday } from '@/lib/check';
import { fmtDate, fmtInt, relativeDays } from '@/lib/format';
import { label, REQUEST_KINDS } from '@/lib/constants';

export const metadata: Metadata = { title: 'Today' };

type Task = { n: number; text: string; cta: string; href: string; tone?: 'warn' };

export default async function Today() {
  const user = await requireUser();
  const n = await needsYou();
  const o = await overview();
  const share = await checkedShare();
  const pct = share.total ? Math.round((share.checked / share.total) * 100) : 0;

  const candidates: Task[] = [
    { n: n.newFromWebsiteTotal, text: n.newFromWebsiteTotal === 1 ? 'new request from the website needs a reply' : 'new requests from the website need a reply', cta: 'Open them', href: '/ops/requests?tab=new', tone: 'warn' },
    { n: n.overdue, text: n.overdue === 1 ? 'follow-up is overdue' : 'follow-ups are overdue', cta: 'See overdue', href: '/ops/requests', tone: 'warn' },
    { n: n.noNextStep, text: n.noNextStep === 1 ? 'request has no next step' : 'requests have no next step', cta: 'Give each an owner and a date', href: '/ops/requests?needs=schedule' },
    { n: n.suggestions, text: n.suggestions === 1 ? 'suggested match is waiting for a yes or no' : 'suggested matches are waiting for a yes or no', cta: 'Review matches', href: '/ops/matches' },
    { n: n.readyToShow, text: n.readyToShow === 1 ? 'project is ready to show on the website' : 'projects are ready to show on the website', cta: 'See them', href: '/ops/projects?show=ready' },
    { n: n.staleProgramPages, text: n.staleProgramPages === 1 ? 'funding program has not been looked at in 90 days' : 'funding programs have not been looked at in 90 days', cta: 'Look at them', href: '/ops/funding' },
    { n: n.toCheck, text: n.toCheck === 1 ? 'record is waiting to be checked' : 'records are waiting to be checked', cta: 'Start checking', href: '/ops/check' },
    { n: n.problems, text: n.problems === 1 ? 'data problem to look at' : 'data problems to look at', cta: 'Look at them', href: '/ops/data-quality' },
  ];
  const tasks = candidates.filter((t) => t.n > 0);

  return (
    <OpsPage section="Today">
      <h1>Hello, {user.name.split(' ')[0]}</h1>
      <p className="lede">Here is what needs a person today. Work from the top.</p>

      <section className="card" style={{ marginTop: 20 }} aria-labelledby="needs">
        <h2 id="needs">Needs you now</h2>
        {tasks.length === 0 ? (
          <p className="row" style={{ marginTop: 12, gap: 10 }}><CheckCircle2 color="var(--ok)" aria-hidden /> You are all caught up. Nothing is waiting.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
            {tasks.map((t) => (
              <li key={t.href + t.text} className="row" style={{ justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ fontSize: 17 }}><b className={t.tone === 'warn' ? 'kpi-amber num' : 'num'} style={{ fontSize: 24, marginRight: 10 }}>{fmtInt(t.n)}</b>{t.text}</span>
                <Link href={t.href} className="btn sm primary">{t.cta}</Link>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted" style={{ marginTop: 10 }}>You checked {await checkedByUserToday(user.id)} {await checkedByUserToday(user.id) === 1 ? 'record' : 'records'} today.</p>
      </section>

      {n.newFromWebsite.length > 0 && (
        <section className="card" aria-labelledby="web">
          <h2 id="web">Latest from the website</h2>
          {n.newFromWebsite.map((r) => (
            <div className="listrow" key={r.id} style={{ gridTemplateColumns: '1fr auto' }}>
              <Link href={`/ops/requests/${r.id}`}><b>{r.from_name}</b><span className="meta">{label(REQUEST_KINDS, r.kind)} · {r.ref} · {relativeDays(r.received_at)}</span></Link>
              <Link href={`/ops/requests/${r.id}`} className="btn sm">Reply</Link>
            </div>
          ))}
        </section>
      )}

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <section className="card" style={{ marginTop: 0 }} aria-labelledby="stage">
          <h2 id="stage">Where requests stand</h2>
          <p className="card-sub">{o.byStatus.split.total} requests in all</p>
          <div style={{ marginTop: 10 }}>
            {o.byStatus.rows.map((r) => (
              <div key={r.key} className="row" style={{ justifyContent: 'space-between', padding: '7px 0' }}>
                <StatusPill status={r.key} /><b className="num">{r.n}</b>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 10 }}><Link className="link small" href="/ops/requests?view=board">See them as a board</Link></p>
        </section>

        <section className="card" style={{ marginTop: 0 }} aria-labelledby="soon">
          <h2 id="soon">Coming up</h2>
          {n.closing.length === 0 && n.dueSoon === 0 ? <p className="muted" style={{ marginTop: 10 }}>Nothing is due in the next week, and no funding closes this month.</p> : (
            <div style={{ marginTop: 8 }}>
              {n.dueSoon > 0 && <p className="small" style={{ margin: '6px 0' }}><b className="num">{n.dueSoon}</b> follow-ups due in the next 7 days. <Link className="link" href="/ops/requests">See them</Link></p>}
              {n.closing.map((c) => (
                <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                  <Link href={`/ops/funding/${c.id}`}>{c.name}</Link><span className="small muted nowrap">closes {fmtDate(c.window_end)} ({c.days} days)</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="health">
        <h2 id="health">How checked is the data?</h2>
        <p className="card-sub">{fmtInt(share.checked)} of {fmtInt(share.total)} records have been compared with their source by a person.</p>
        <div className="meter" role="img" aria-label={`${pct} percent checked`} style={{ marginTop: 12 }}><i style={{ width: `${Math.max(pct, 1)}%` }} /></div>
        <p style={{ marginTop: 6 }}><Link className="link small" href="/ops/check">Check some now</Link></p>
      </section>
    </OpsPage>
  );
}
