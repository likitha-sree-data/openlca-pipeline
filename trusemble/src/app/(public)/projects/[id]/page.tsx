import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import MiniMap from '@/components/public/MiniMap';
import { IntroForm } from '@/components/public/forms';
import { getProject } from '@/lib/public-data';
import { label, PRECISIONS, PROJECT_CATEGORIES, PROJECT_STAGES } from '@/lib/constants';
import { fmtMoney, fmtRange, todayIso } from '@/lib/format';
import { windowLabel, windowStatus } from '@/lib/programs';
import { safeHref } from '@/lib/safe-url';

type P = { params: Promise<{ id: string }> };
const PRECISION_NOTE: Record<string, string> = { parcel: 'Parcel or address-level location.', area_centre: 'Centre of the treated area, not a measured boundary.', community: 'Community-level location, not a measured boundary.', county: 'County-level location only.' };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { id } = await params;
  const d = /^\d+$/.test(id) ? getProject(Number(id)) : null;
  return d ? { title: d.project.name, description: d.project.description?.slice(0, 160) ?? `${d.project.name}, ${d.project.county ?? ''}` } : { title: 'Project not found' };
}

export default async function ProjectPage({ params }: P) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const d = getProject(Number(id));
  if (!d) notFound();
  const { project: p, awards, programs } = d;
  const today = todayIso();
  const stage = label(PROJECT_STAGES, p.stage);
  return (
    <div className="container">
      <p style={{ paddingTop: 24 }}><Link className="link" href="/projects">← All projects</Link></p>
      <div style={{ display: 'grid', gap: 28, padding: '20px 0 28px' }} className="detail-grid">
        <div>
          <h1 style={{ fontSize: 'clamp(30px,4.6vw,48px)', maxWidth: '22ch', fontWeight: 700 }}>{p.name}</h1>
          <p className="row" style={{ margin: '14px 0' }}>
            <span className={`pill ${p.stage === 'seeking_funding' ? 'ok' : 'info'}`}>{stage}</span>
            <span className="pill quiet">{p.verification === 'verified' ? 'Verified' : p.verification === 'demo' ? 'Demo' : 'Unverified'}</span>
            <span className="small muted">{p.verification === 'verified' ? 'Checked against its source by the TruSemble team' : 'From a public record, not yet checked by the TruSemble team'}</span>
          </p>
          {p.description && <p style={{ fontSize: 18, color: 'var(--ink-2)', maxWidth: '60ch' }}>{p.description}</p>}
          {p.owner && <p className="small" style={{ marginTop: 14 }}>Run by <b>{p.owner}</b></p>}
        </div>
        {p.lat != null && p.lng != null ? <MiniMap lat={p.lat} lng={p.lng} precision={p.location_precision} /> : <div className="empty">This project is not placed on the map yet.</div>}
      </div>

      <dl className="card stat-grid" style={{ margin: 0, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <div><dt className="small muted">Category</dt><dd style={{ margin: 0, fontWeight: 700 }}>{label(PROJECT_CATEGORIES, p.category)}</dd></div>
        <div><dt className="small muted">County</dt><dd style={{ margin: 0, fontWeight: 700 }}>{p.county ?? 'Not recorded'}{p.state ? `, ${p.state}` : ''}</dd></div>
        <div><dt className="small muted">Location precision</dt><dd style={{ margin: 0, fontWeight: 700 }}>{label(PRECISIONS, p.location_precision) || 'Not placed'}</dd><dd className="tiny muted" style={{ margin: 0 }}>{PRECISION_NOTE[p.location_precision ?? ''] ?? ''}</dd></div>
        <div><dt className="small muted">Needs</dt><dd style={{ margin: 0, fontWeight: 700 }}>{p.needs ?? 'Not stated'}</dd></div>
      </dl>

      <div className="detail-grid" style={{ marginTop: 22, paddingBottom: 40 }}>
        <div className="stack">
          <section className="card">
            <h2>Funding</h2>
            {awards.length === 0 && !p.budget_amount && !p.requested_amount ? (
              <p className="muted" style={{ marginTop: 8 }}>No budget or award recorded yet. <Link className="link" href={`/contact?topic=${encodeURIComponent('Something else')}`}>Know it? Add it</Link></p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }}>
                {p.requested_amount ? <li>Requested: <b>{fmtMoney(p.requested_amount)}</b></li> : null}
                {p.budget_amount ? <li>Budget: <b>{fmtMoney(p.budget_amount)}</b></li> : null}
                {awards.map((a) => <li key={a.id}>{a.program ?? 'Award'}{a.year ? ` (${a.year})` : ''}: committed <b>{fmtMoney(a.amount_committed)}</b>{a.amount_disbursed ? `, disbursed ${fmtMoney(a.amount_disbursed)}` : ''}</li>)}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>Programs to look at</h2>
            <p className="card-sub">Open or rolling programs that cover {p.county ?? 'this area'}. A place to start, not an eligibility check.</p>
            {programs.length === 0 ? <p className="muted" style={{ marginTop: 10 }}>No open programs cover this county in the record.</p> : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
                {programs.map((pr) => (
                  <li key={pr.id} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                    <b>{safeHref(pr.url) ? <a className="link" href={safeHref(pr.url)!} target="_blank" rel="noopener noreferrer">{pr.name}</a> : pr.name}</b>
                    <div className="small muted">{pr.run_by} · {fmtRange(pr.award_min, pr.award_max, pr.award_text)} · {windowStatus(pr, today) === 'open' ? windowLabel(pr) : 'Rolling'}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {safeHref(p.source_url) && <p className="small muted">Source: <a className="link" href={safeHref(p.source_url)!} target="_blank" rel="noopener noreferrer">{d.project.source_name ?? 'public record'}</a></p>}
        </div>
        <aside className="card" aria-labelledby="work">
          <h2 id="work">Work on this project</h2>
          <p className="card-sub" style={{ margin: '6px 0 14px' }}>The team introduces funders, crews and partners once both sides agree.</p>
          <IntroForm projectId={p.id} />
          <p style={{ marginTop: 16 }}><Link className="btn" href={`/request-funding?projectId=${p.id}&projectName=${encodeURIComponent(p.name)}`}>Request funding →</Link></p>
        </aside>
      </div>
    </div>
  );
}
