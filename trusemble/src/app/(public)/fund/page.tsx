import type { Metadata } from 'next';
import Link from 'next/link';
import { all } from '@/lib/db';
import { publicRows } from '@/lib/visibility';
import { fmtMoney, fmtInt } from '@/lib/format';
import { label, PROJECT_CATEGORIES } from '@/lib/constants';

export const metadata: Metadata = { title: 'Fund the work', description: 'Ready wildfire projects that were turned down or are still seeking funding, each with its scope and source. Back one directly.' };

export default function FundPage() {
  const rows = all<{ id: number; name: string; county: string | null; state: string | null; category: string; requested_amount: number | null; owner: string | null; description: string | null }>(
    `SELECT p.id, p.name, p.county, p.state, p.category, p.requested_amount, o.name owner, p.description FROM projects p LEFT JOIN organizations o ON o.id = p.owner_org_id
     WHERE p.stage = 'seeking_funding' AND ${publicRows('p')}
     ORDER BY (p.description IS NOT NULL) DESC, p.requested_amount IS NULL, p.requested_amount DESC, p.name LIMIT 60`,
  );
  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="page-title">
        <h1>Fund the work</h1>
        <p>Ready projects that were turned down or are still seeking funding, each with its scope and source. Pick one, and the team introduces you once the community confirms the scope.</p>
      </div>
      <p className="small muted" style={{ marginBottom: 12 }}>{fmtInt(rows.length)} projects shown. <Link className="link" href="/projects?stage=seeking_funding">Open them on the map</Link></p>
      <div className="stack">
        {rows.map((p) => (
          <article key={p.id} className="program">
            <div className="tags"><span>{label(PROJECT_CATEGORIES, p.category)}</span><span className="u">Not yet checked</span></div>
            <h3><Link href={`/projects/${p.id}`}>{p.name}</Link></h3>
            {p.description && <p style={{ color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
            <div className="foot"><span>{p.owner ? `${p.owner} · ` : ''}{p.county ?? ''}{p.state ? `, ${p.state}` : ''}{p.requested_amount ? ` · Requested ${fmtMoney(p.requested_amount)}` : ''}</span><Link className="btn" href={`/projects/${p.id}`}>Request an introduction</Link></div>
          </article>
        ))}
        {rows.length === 0 && <div className="empty">No projects are seeking funding in the published record right now.</div>}
      </div>
    </div>
  );
}
