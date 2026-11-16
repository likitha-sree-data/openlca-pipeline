import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { listPrograms, type PublicProgram } from '@/lib/public-data';
import { label, PROGRAM_TYPES, US_STATES } from '@/lib/constants';
import { fmtDate, fmtRange, todayIso } from '@/lib/format';
import { whereLabel } from '@/lib/crud';
import { safeHref } from '@/lib/safe-url';
import { WINDOW_HEADINGS, WINDOW_ORDER, windowLabel, windowStatus, type WindowStatus } from '@/lib/programs';

export const metadata: Metadata = { title: 'Funding programs', description: 'State and federal funding matched with your projects, startups and crews. Each program shows who runs it, what it awards and when it is open.' };

function Card({ p }: { p: PublicProgram }) {
  return (
    <article className="program" aria-label={p.name}>
      <div className="tags"><span>{label(PROGRAM_TYPES, p.type)}</span><span className="u">{p.verification === 'verified' ? 'Verified' : 'Unverified'}</span></div>
      <h3>{p.name}</h3>
      <p>Run by <b>{p.run_by}</b>{p.funded_by ? <>, funded by <b>{p.funded_by}</b></> : null}</p>
      {p.focus && <p className="muted">Focus: {p.focus.split(',').map((s) => s.trim()).join(', ')}</p>}
      <div className="kv">
        <div><div className="k">Award</div><div className="v" style={{ color: p.award_min == null && p.award_max == null && !p.award_text ? 'var(--muted)' : undefined, fontWeight: p.award_min == null && p.award_max == null && !p.award_text ? 400 : 700 }}>{fmtRange(p.award_min, p.award_max, p.award_text)}</div></div>
        <div><div className="k">Window</div><div className="v">{windowLabel(p)}</div></div>
      </div>
      {p.eligibility && <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}><b>Who can apply:</b> {p.eligibility}</p>}
      <div className="foot">
        <span>{whereLabel(p.scope, p.state, p.counties)}{p.checked_at ? ` · Checked ${fmtDate(p.checked_at)}` : ''}</span>
        {safeHref(p.url) && <a className="btn" href={safeHref(p.url)!} target="_blank" rel="noopener noreferrer">Program page <ExternalLink size={15} aria-hidden /></a>}
      </div>
    </article>
  );
}

export default async function FundingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = todayIso();
  let programs = listPrograms();
  const states = [...new Set(programs.map((p) => p.state).filter((s): s is string => !!s))].sort();
  if (sp.state) programs = programs.filter((p) => p.scope === 'national' || p.state === sp.state);
  if (sp.type) programs = programs.filter((p) => p.type === sp.type);
  const groups: Record<WindowStatus, PublicProgram[]> = { open: [], rolling: [], upcoming: [], past: [] };
  for (const p of programs) groups[windowStatus(p, today)].push(p);
  for (const g of Object.values(groups)) g.sort((a, b) => (a.window_end ?? '9').localeCompare(b.window_end ?? '9') || a.name.localeCompare(b.name));
  const verified = programs.filter((p) => p.verification === 'verified').length;
  return (
    <div className="container">
      <div className="page-title">
        <h1>Funding programs for wildfire work</h1>
        <p>State and federal funding matched with your projects, startups, and crews. Each program shows who runs it, what it awards and when it is open.</p>
        <p style={{ marginTop: 18 }}><Link href="/calculator" className="btn">Estimate your project →</Link></p>
      </div>
      <form method="get" className="toolbar" aria-label="Filter programs">
        <select name="state" className="select" defaultValue={sp.state ?? ''} aria-label="State"><option value="">Any state</option>{states.map((s) => <option key={s} value={s}>{US_STATES[s] ?? s}</option>)}</select>
        <select name="type" className="select" defaultValue={sp.type ?? ''} aria-label="Type"><option value="">Any type</option>{PROGRAM_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn sm">Apply</button>
        {(sp.state || sp.type) && <Link href="/funding" className="link small">Clear</Link>}
      </form>
      <p style={{ fontSize: 17 }}><b>{programs.length} programs listed:</b> {groups.open.length} open now, {groups.rolling.length} accept applications any time, {groups.past.length} with past windows{groups.upcoming.length ? `, ${groups.upcoming.length} upcoming` : ''}. {verified} checked by the TruSemble team, {programs.length - verified} from public records and not yet checked.</p>
      <p style={{ margin: '14px 0 8px' }}><Link href="/request-funding" className="btn primary">Request funding help →</Link></p>
      {WINDOW_ORDER.map((w) => groups[w].length > 0 && (
        <section key={w} style={{ marginTop: 40 }} aria-labelledby={`h-${w}`}>
          <h2 id={`h-${w}`} style={{ fontSize: 'clamp(28px,4vw,38px)' }}>{WINDOW_HEADINGS[w].title} <span className="muted" style={{ fontWeight: 500 }}>{groups[w].length}</span></h2>
          <p className="small muted" style={{ margin: '8px 0 18px' }}>{WINDOW_HEADINGS[w].sub}</p>
          {groups[w].map((p) => <Card key={p.id} p={p} />)}
        </section>
      ))}
      {programs.length === 0 && <div className="empty" style={{ marginTop: 24 }}>No programs match those filters.</div>}
      <p className="small muted" style={{ margin: '36px 0 0' }}>Figures from public program pages; check each program&apos;s own page before applying.</p>
    </div>
  );
}
