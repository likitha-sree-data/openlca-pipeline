import type { Metadata } from 'next';
import Link from 'next/link';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead } from '@/components/ops/ui';
import { all } from '@/lib/db';
import { decideMatchAction, generateMatchesAction } from '@/app/ops/actions';
import { fmtRange, fmtDate } from '@/lib/format';
import { label, PROJECT_CATEGORIES } from '@/lib/constants';

export const metadata: Metadata = { title: 'Matches' };

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const status = ['suggested', 'accepted', 'dismissed'].includes(s ?? '') ? (s as string) : 'suggested';
  const counts = Object.fromEntries((await all<{ status: string; n: number }>('SELECT status, COUNT(*) n FROM matches GROUP BY status')).map((r) => [r.status, r.n]));
  const rows = await all<{ id: number; score: number; reason: string; project_id: number; project: string; county: string | null; state: string | null; category: string; requested: number | null; program_id: number; program: string; run_by: string | null; award_min: number | null; award_max: number | null; award_text: string | null; decided_at: string | null }>(
    `SELECT m.id, m.score, m.reason, p.id project_id, p.name project, p.county, p.state, p.category, p.requested_amount requested, pr.id program_id, pr.name program, pr.run_by, pr.award_min, pr.award_max, pr.award_text, m.decided_at
     FROM matches m JOIN projects p ON p.id = m.project_id JOIN programs pr ON pr.id = m.program_id
     WHERE m.status = ? AND p.archived = 0 ORDER BY m.score DESC, p.name LIMIT 100`, status,
  );
  return (
    <OpsPage section="Matches">
      <PageHead title="Matches">Suggested pairings of projects with funding programs, each with the reason it was suggested, for an operator to accept or dismiss.</PageHead>
      <div className="toolbar">
        <form action={generateMatchesAction}><button className="btn primary sm">Refresh suggestions</button></form>
        <div className="seg" role="group" aria-label="Status">{(['suggested', 'accepted', 'dismissed'] as const).map((k) => <Link key={k} href={`/ops/matches?s=${k}`} className={status === k ? 'on' : ''}>{k[0].toUpperCase() + k.slice(1)} <span className="muted">{counts[k] ?? 0}</span></Link>)}</div>
      </div>
      <p className="small muted" style={{ marginBottom: 14 }}>Suggestions cover projects that are planning or seeking funding. A program is suggested only when it covers the project&apos;s place, is not past its window, and pays for the same kind of work. Decisions are kept when suggestions are refreshed.</p>
      {rows.length === 0 ? <div className="empty">{status === 'suggested' ? 'No suggestions yet. Refresh suggestions to generate them from the current projects and programs.' : `No ${status} matches.`}</div> : (
        <div className="stack">
          {rows.map((m) => (
            <article key={m.id} className="card" style={{ marginTop: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 320px' }}>
                  <p className="small muted">Project · {label(PROJECT_CATEGORIES, m.category)} · {m.county ?? ''}{m.state ? `, ${m.state}` : ''}{m.requested ? ` · requested $${Math.round(m.requested).toLocaleString('en-US')}` : ''}</p>
                  <h3 style={{ fontSize: 18 }}><Link href={`/ops/projects/${m.project_id}`}>{m.project}</Link></h3>
                  <p style={{ margin: '10px 0 2px' }} className="small muted">Suggested program</p>
                  <h3 style={{ fontSize: 18 }}><Link href={`/ops/funding/${m.program_id}`}>{m.program}</Link></h3>
                  <p className="small muted">{m.run_by} · {fmtRange(m.award_min, m.award_max, m.award_text)}</p>
                  <p style={{ marginTop: 10 }}><b>Why:</b> {m.reason}</p>
                  {m.decided_at && <p className="tiny muted">Decided {fmtDate(m.decided_at)}</p>}
                </div>
                <div className="row">
                  {status !== 'accepted' && <form action={decideMatchAction.bind(null, m.id, 'accepted')}><button className="btn primary sm">Accept</button></form>}
                  {status !== 'dismissed' && <form action={decideMatchAction.bind(null, m.id, 'dismissed')}><button className="btn sm">Dismiss</button></form>}
                  {status !== 'suggested' && <form action={decideMatchAction.bind(null, m.id, 'suggested')}><button className="btn sm ghost">Undo</button></form>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </OpsPage>
  );
}
