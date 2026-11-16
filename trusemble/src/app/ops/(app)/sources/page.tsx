import type { Metadata } from 'next';
import Link from 'next/link';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead, Split } from '@/components/ops/ui';
import { AutoForm } from '@/components/ops/AutoForm';
import { all, scalar } from '@/lib/db';
import { fmtInt, relativeDays } from '@/lib/format';
import { feedParts, feedTotal } from '@/lib/format-feeds';
import { safeHref } from '@/lib/safe-url';
import { label, SOURCE_KINDS } from '@/lib/constants';
import { toggleAssessedAction } from '@/app/ops/actions';
import { SourceForm } from './SourceForm';

export const metadata: Metadata = { title: 'Sources' };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const sp = await searchParams;
  const where: string[] = [];
  const params: string[] = [];
  if (sp.q) { where.push('(s.name LIKE ? OR s.url LIKE ?)'); params.push(`%${sp.q}%`, `%${sp.q}%`); }
  if (sp.kind) { where.push('s.kind = ?'); params.push(sp.kind); }
  const rows = all<{ id: number; name: string; url: string | null; kind: string; description: string | null; last_fetched_at: string | null; assessed: number; is_private: number; verification: string; orgs: number; projects: number; programs: number; awards: number; last_status: string | null; runs: number }>(
    `SELECT s.*, (SELECT COUNT(*) FROM organizations WHERE source_id = s.id) orgs, (SELECT COUNT(*) FROM projects WHERE source_id = s.id) projects,
       (SELECT COUNT(*) FROM programs WHERE source_id = s.id) programs, (SELECT COUNT(*) FROM awards WHERE source_id = s.id) awards,
       (SELECT status FROM source_runs WHERE source_id = s.id ORDER BY id DESC LIMIT 1) last_status, (SELECT COUNT(*) FROM source_runs WHERE source_id = s.id) runs
     FROM sources s ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY (orgs + projects + programs + awards) DESC, s.name`, ...params,
  );
  const total = scalar<number>('SELECT COUNT(*) FROM sources');
  const split = { v: scalar<number>("SELECT COUNT(*) FROM sources WHERE verification='verified'"), u: scalar<number>("SELECT COUNT(*) FROM sources WHERE verification='unverified'"), d: scalar<number>("SELECT COUNT(*) FROM sources WHERE verification='demo'") };
  const feeding = rows.filter((r) => r.orgs + r.projects + r.programs + r.awards > 0).length;
  const fetched = scalar<number>("SELECT COUNT(*) FROM sources WHERE last_fetched_at IS NOT NULL");
  return (
    <OpsPage section="Sources">
      <PageHead title="Sources">Every source the record cites, how many rows it feeds, when it was last fetched, and whether the pilot has assessed it. Grows with every fetcher run</PageHead>
      <AutoForm className="toolbar">
        <input name="q" defaultValue={sp.q} className="input search" placeholder="Search name or URL" aria-label="Search" />
        <select name="kind" className="select" defaultValue={sp.kind ?? ''} aria-label="Kind"><option value="">Any kind</option>{SOURCE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn sm">Filter</button>
        <span style={{ marginLeft: 'auto' }} className="small">Public ledger: <a className="link" href="/api/public/ledger">JSON</a> · <a className="link" href="/api/public/ledger?format=csv">CSV</a> · <Link className="link" href="/data">page</Link></span>
      </AutoForm>
      <p className="row" style={{ gap: 18, margin: '4px 0 14px' }}><span><b className="num">{fmtInt(total)}</b> sources</span><Split v={split.v} u={split.u} d={split.d} /><span className="small muted">{feeding} feed at least one row · {fetched} fetched</span></p>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>Source</th><th>Kind</th><th>Rows fed</th><th>Last fetched</th><th>Assessed</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td style={{ minWidth: 320 }}><b>{s.name}</b> {s.is_private ? <span className="pill quiet">Private</span> : null}
                {safeHref(s.url) && <span className="sub"><a className="link" href={safeHref(s.url)!} target="_blank" rel="noopener noreferrer">{(s.url ?? '').replace(/^https?:\/\//, '').slice(0, 70)}</a></span>}
                {s.description && <span className="sub" style={{ marginTop: 4 }}>{s.description}</span>}</td>
              <td>{label(SOURCE_KINDS, s.kind)}</td>
              <td className="small">{feedTotal({ organizations: s.orgs, projects: s.projects, programs: s.programs, awards: s.awards }) === 0 ? <span className="muted">0</span> : <><b className="num">{fmtInt(feedTotal({ organizations: s.orgs, projects: s.projects, programs: s.programs, awards: s.awards }))}</b><span className="sub">{feedParts({ organizations: s.orgs, projects: s.projects, programs: s.programs, awards: s.awards }).join(', ')}</span></>}</td>
              <td className="small nowrap">{s.last_fetched_at ? relativeDays(s.last_fetched_at) : <span className="muted">never</span>}{s.runs ? <span className="sub">{s.runs} run{s.runs === 1 ? '' : 's'}{s.last_status === 'error' ? ' · last failed' : ''}</span> : null}</td>
              <td><form action={toggleAssessedAction.bind(null, s.id)}><button className={`pill ${s.assessed ? 'ok' : 'quiet'}`} style={{ cursor: 'pointer' }} aria-pressed={!!s.assessed}>{s.assessed ? 'Assessed' : 'Not assessed'}</button></form></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <details className="card" style={{ marginTop: 18 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Add a source</summary><div style={{ marginTop: 14 }}><SourceForm /></div></details>
    </OpsPage>
  );
}
