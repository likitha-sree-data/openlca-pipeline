import type { Metadata } from 'next';
import Link from 'next/link';
import CoverageMap from '@/components/public/CoverageMap';
import { BarList } from '@/components/BarList';
import { dataCharts, headline, sourcesLedger } from '@/lib/public-data';
import { fmtDate, fmtInt, fmtMoney, relativeDays, todayIso } from '@/lib/format';
import { feedParts, feedTotal } from '@/lib/format-feeds';
import { safeHref } from '@/lib/safe-url';
import { label, ORG_TYPES, PROJECT_STAGES, SOURCE_KINDS } from '@/lib/constants';

export const metadata: Metadata = { title: 'The data', description: 'The record itself: every source, every county, every row with its provenance.' };

export default async function DataPage() {
  const h = await headline();
  const c = await dataCharts();
  const ledger = await sourcesLedger();
  const stat = (n: number, l: string) => <div className="stat" key={l}><b className="num">{fmtInt(n)}</b><span>{l}</span></div>;
  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="page-title">
        <h1 style={{ maxWidth: '24ch' }}>The record itself: every source, every county, every row with its provenance</h1>
        <p>TruSemble collects the US wildfire mitigation record from public sources and keeps it current. This page shows what is in it today, where it comes from, and how fresh it is. People are never in it.</p>
        <div className="row" style={{ marginTop: 18 }}><Link className="link link-arrow" href="/contact?topic=Monthly%20brief%20or%20data%20license">Get the monthly brief or license the data</Link><Link className="btn" href="/projects">Open the map →</Link></div>
      </div>

      <section aria-labelledby="counts" style={{ marginTop: 24 }}>
        <p className="small" style={{ color: 'var(--brand)', fontWeight: 700 }}>What is in the record</p>
        <h2 id="counts" style={{ fontSize: 'clamp(28px,4vw,40px)', margin: '4px 0 18px' }}>Headline counts, as of {fmtDate(todayIso())}</h2>
        <div className="stat-grid">
          {stat(h.orgs, 'Organizations')}{stat(h.projects, 'Projects')}{stat(h.awards, 'Awards on record')}{stat(h.programs, 'Funding programs')}
          {stat(h.sources, 'Sources')}{stat(h.counties, 'Counties covered')}{stat(h.verified, 'Records checked by a person')}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Counts are of published rows. Every record keeps its source and says whether a person has checked it. {fmtInt(h.verified)} have been checked against their source.</p>
      </section>

      <section style={{ marginTop: 56 }} aria-labelledby="coverage">
        <p className="small" style={{ color: 'var(--brand)', fontWeight: 700 }}>Coverage</p>
        <h2 id="coverage" style={{ fontSize: 'clamp(28px,4vw,40px)', margin: '4px 0 10px' }}>Where the record reaches</h2>
        <p className="lede" style={{ marginBottom: 18, fontSize: 18, color: 'var(--ink-2)', maxWidth: '60ch' }}>{fmtInt(h.counties)} counties across every state are in the record; the overview shows the lower 48. Darker means more of the chosen layer. Each layer is one source and one kind of figure, never added to another.</p>
        <CoverageMap />
      </section>

      <section style={{ marginTop: 56 }} aria-labelledby="shape">
        <p className="small" style={{ color: 'var(--brand)', fontWeight: 700 }}>Shape of the record</p>
        <h2 id="shape" style={{ fontSize: 'clamp(28px,4vw,40px)', margin: '4px 0 18px' }}>What kinds of rows there are</h2>
        <div className="stack">
          <div className="card"><h3 style={{ fontSize: 16, marginBottom: 12 }}>Organizations by type</h3><BarList rows={c.orgTypes} labels={Object.fromEntries(ORG_TYPES)} /></div>
          <div className="card"><h3 style={{ fontSize: 16, marginBottom: 12 }}>Projects by stage</h3><BarList rows={c.stages} labels={Object.fromEntries(PROJECT_STAGES)} /></div>
          <div className="card"><h3 style={{ fontSize: 16, marginBottom: 12 }}>Awards by program (count of awards)</h3><BarList rows={c.funders.map((f) => ({ k: f.name, n: f.awards }))} /></div>
          <div className="card"><h3 style={{ fontSize: 16, marginBottom: 12 }}>Funding programs by window</h3><BarList rows={[{ k: 'Open now', n: c.windows.open }, { k: 'Apply any time', n: c.windows.rolling }, { k: 'Upcoming', n: c.windows.upcoming }, { k: 'Past window', n: c.windows.past }]} /></div>
        </div>
      </section>

      <section style={{ marginTop: 56 }} aria-labelledby="net">
        <p className="small" style={{ color: 'var(--brand)', fontWeight: 700 }}>Network</p>
        <h2 id="net" style={{ fontSize: 'clamp(28px,4vw,40px)', margin: '4px 0 10px' }}>Funders to recipients</h2>
        <p style={{ color: 'var(--ink-2)', maxWidth: '58ch', marginBottom: 16 }}>Which programs reach the most organizations, and how much they committed. Awards are the historical record; they are not available funding.</p>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Program</th><th className="right">Recipients</th><th className="right">Awards</th><th className="right">Committed</th></tr></thead>
          <tbody>
            {c.funders.length === 0 && <tr><td colSpan={4} className="muted">No awards in the record yet. Run the ingest to load federal awards.</td></tr>}
            {c.funders.map((f) => <tr key={f.name}><td>{f.name}</td><td className="right num">{fmtInt(f.recipients)}</td><td className="right num">{fmtInt(f.awards)}</td><td className="right num">{fmtMoney(f.committed, { compact: true })}</td></tr>)}
          </tbody>
        </table></div>
        <p className="small muted" style={{ marginTop: 10 }}>0 organization relationships recorded · {c.intros} introductions made through TruSemble · {c.requests} requests received. Counts only; the people behind them are private.</p>
      </section>

      <section style={{ marginTop: 56 }} aria-labelledby="sources">
        <h2 id="sources" style={{ fontSize: 'clamp(28px,4vw,40px)', marginBottom: 10 }}>Every source the record cites</h2>
        <p style={{ color: 'var(--ink-2)', maxWidth: '58ch', marginBottom: 16 }}>{ledger.length} public sources today. Each row says what it feeds and when it was last retrieved. The ledger grows with every fetcher we add. <a className="link" href="/api/public/ledger">JSON</a> · <a className="link" href="/api/public/ledger?format=csv">CSV</a></p>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Source</th><th>Kind</th><th>Feeds</th><th>Runs</th></tr></thead>
          <tbody>
            {ledger.map((s) => {
              const max = Math.max(1, ...s.runs.map((r) => r.rows_new));
              return (
                <tr key={s.id}>
                  <td style={{ minWidth: 280 }}>
                    {safeHref(s.url) ? <a className="link" href={safeHref(s.url)!} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}
                    {s.description && <span className="sub" style={{ marginTop: 6 }}>{s.description}</span>}
                  </td>
                  <td>{label(SOURCE_KINDS, s.kind)}</td>
                  <td className="small">{feedTotal(s.feeds) === 0 ? <span className="muted">No rows yet</span> : feedParts(s.feeds).join(', ')}</td>
                  <td className="small nowrap">
                    {s.runs.length === 0 ? <span className="muted">{s.last_fetched_at ? 'manual' : 'not yet run'}</span> : (
                      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 8 }}>
                        <span aria-hidden style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end', height: 22 }}>{[...s.runs].reverse().map((r, i) => <i key={i} style={{ width: 6, height: Math.max(3, (r.rows_new / max) * 22), background: r.status === 'ok' ? 'var(--brand)' : 'var(--danger)', display: 'block', borderRadius: 1 }} />)}</span>
                        {s.runs.length} run{s.runs.length === 1 ? '' : 's'} · last {relativeDays(s.runs[0].started_at)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
