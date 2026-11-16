import type { Metadata } from 'next';
import Link from 'next/link';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead, VerifPill } from '@/components/ops/ui';
import { all, scalar } from '@/lib/db';
import { resolveIssueAction, scanDuplicatesAction } from '@/app/ops/actions';
import { fmtInt, relativeDays } from '@/lib/format';
import { label, ORG_TYPES } from '@/lib/constants';

export const metadata: Metadata = { title: 'Data quality' };

export default function DataQuality() {
  const issues = all<{ id: number; kind: string; entity: string; entity_id: number; other_id: number | null; field: string | null; existing_value: string | null; incoming_value: string | null; detail: string | null; created_at: string; name: string | null; other: string | null }>(
    `SELECT i.*, COALESCE((SELECT name FROM organizations WHERE id = i.entity_id AND i.entity = 'organizations'), (SELECT name FROM contacts WHERE id = i.entity_id AND i.entity = 'contacts'), (SELECT name FROM projects WHERE id = i.entity_id AND i.entity = 'projects'), (SELECT from_name FROM requests WHERE id = i.entity_id AND i.entity = 'requests')) name,
            (SELECT name FROM organizations WHERE id = i.other_id) other
     FROM issues i WHERE i.status = 'open' ORDER BY i.id DESC LIMIT 100`);
  const orgMissingWhere = `archived = 0 AND ((website IS NULL OR website = '') OR type = 'other')`;
  const orgMissingN = scalar<number>(`SELECT COUNT(*) FROM organizations WHERE ${orgMissingWhere}`);
  const orgMissing = all<{ id: number; name: string; type: string; website: string | null; verification: string }>(`SELECT id, name, type, website, verification FROM organizations WHERE ${orgMissingWhere} ORDER BY name COLLATE NOCASE LIMIT 500`);
  const missSplit = all<{ v: string; n: number }>(`SELECT verification v, COUNT(*) n FROM (SELECT verification FROM organizations WHERE ${orgMissingWhere} ORDER BY name COLLATE NOCASE LIMIT 500) GROUP BY verification`);
  const ms = (k: string) => missSplit.find((m) => m.v === k)?.n ?? 0;
  const noOrg = all<{ id: number; name: string }>('SELECT id, name FROM contacts WHERE archived = 0 AND org_id IS NULL ORDER BY name LIMIT 100');
  const noOrgN = scalar<number>('SELECT COUNT(*) FROM contacts WHERE archived = 0 AND org_id IS NULL');
  const offMapN = scalar<number>('SELECT COUNT(*) FROM projects WHERE archived = 0 AND published = 1 AND lat IS NULL');
  const offMap = all<{ id: number; name: string; county: string | null }>('SELECT id, name, county FROM projects WHERE archived = 0 AND published = 1 AND lat IS NULL ORDER BY name COLLATE NOCASE LIMIT 500');
  const recheck = all<{ id: number; name: string; last_fetched_at: string | null; why: string }>(
    `SELECT s.id, s.name, s.last_fetched_at,
       CASE WHEN (SELECT status FROM source_runs WHERE source_id = s.id ORDER BY id DESC LIMIT 1) = 'error' THEN 'Last run failed' ELSE 'Not fetched in 30 days' END why
     FROM sources s WHERE s.is_private = 0 AND s.last_fetched_at IS NOT NULL AND (s.last_fetched_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
       OR (SELECT status FROM source_runs WHERE source_id = s.id ORDER BY id DESC LIMIT 1) = 'error') ORDER BY s.last_fetched_at LIMIT 100`);
  const tiles: [string, number, boolean][] = [['Problems to look at', issues.length, false], ['Groups missing details', Math.min(orgMissingN, 500), orgMissingN > 0], ['Contacts with no organization', noOrgN, noOrgN > 0], ['Projects not on the map', Math.min(offMapN, 500), offMapN > 0], ['Sources to re-check', recheck.length, recheck.length > 0]];
  return (
    <OpsPage section="Data quality">
      <PageHead title="Problems">Things only a person can sort out: a file that disagrees with something already checked, groups that may be listed twice, and records missing what the map needs. Open a record to fix it.</PageHead>
      <div className="stat-grid" style={{ margin: '18px 0' }}>{tiles.map(([l, n, warn]) => <div className="stat" key={l}><span>{l}</span><b className={`num ${warn ? 'kpi-amber' : ''}`}>{fmtInt(n)}</b></div>)}</div>

      <section className="card" style={{ marginTop: 0 }} aria-labelledby="oi">
        <div className="card-head"><h2 id="oi">Problems to look at <span className="muted" style={{ fontWeight: 500 }}>{issues.length}</span></h2><form action={scanDuplicatesAction}><button className="btn sm">Scan for duplicates</button></form></div>
        <p className="small muted">A file brought in a value that disagrees with something a person already checked, or a group that may be listed twice. Open the record, fix it if needed, then mark it resolved. Choose Dismiss if it is not really a problem.</p>
        {issues.length === 0 ? <div className="empty" style={{ marginTop: 14 }}>Nothing to look at. Problems from imports show up here.</div> : (
          <div className="stack" style={{ marginTop: 14 }}>{issues.map((i) => (
            <div key={i.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 320px' }}>
                <span className={`pill ${i.kind === 'conflict' ? 'warn' : 'info'}`}>{i.kind === 'conflict' ? 'Disagrees with a checked record' : 'May be listed twice'}</span>{' '}
                <Link className="link" href={`/ops/${i.entity}/${i.entity_id}`}><b>{i.name ?? `#${i.entity_id}`}</b></Link>{i.other_id && <> and <Link className="link" href={`/ops/organizations/${i.other_id}`}>{i.other ?? `#${i.other_id}`}</Link></>}
                <p className="small muted">{i.detail}</p>
                {i.field && <div className="diff" style={{ marginTop: 4 }}><span className="muted">{i.field}</span><span className="from">{i.existing_value}</span><span className="to">{i.incoming_value}</span></div>}
              </div>
              <form action={resolveIssueAction.bind(null, i.id)} className="row">
                {i.kind === 'conflict' && <button name="action" value="use_incoming" className="btn sm">Use imported value</button>}
                <button name="action" value="resolve" className="btn sm primary">Resolve</button>
                <button name="action" value="dismiss" className="btn sm ghost">Dismiss</button>
              </form>
            </div>))}</div>)}
      </section>

      <section className="card" aria-labelledby="om">
        <h2 id="om">Groups missing details <span className="muted" style={{ fontWeight: 500 }}>{Math.min(orgMissingN, 500)}</span></h2>
        <p className="small muted" style={{ margin: '6px 0 12px' }}><b>{Math.min(orgMissingN, 500)}</b> groups with no website, or whose kind is still Other (first 500) · {ms('verified')} checked · {ms('unverified')} not yet checked · {ms('demo')} sample. Add the website or pick a kind on the group's page.</p>
        <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}><table className="t"><thead><tr><th>Name</th><th>Missing</th><th>Checked?</th></tr></thead><tbody>
          {orgMissing.map((o) => <tr key={o.id}><td><Link className="link" href={`/ops/organizations/${o.id}`}>{o.name}</Link></td><td>{[!o.website && 'Website', o.type === 'other' && 'Type'].filter(Boolean).join(', ')}</td><td><VerifPill v={o.verification} /></td></tr>)}
          {orgMissing.length === 0 && <tr><td colSpan={3} className="muted">Every organization has a website and a type.</td></tr>}
        </tbody></table></div>
        <span className="tiny muted">{label(ORG_TYPES, 'other')} means the type is still unknown.</span>
      </section>

      <section className="card" aria-labelledby="cn">
        <h2 id="cn">Contacts with no organization <span className="muted" style={{ fontWeight: 500 }}>{noOrgN}</span></h2>
        {noOrg.length === 0 ? <p className="muted small" style={{ marginTop: 8 }}>Every contact belongs to an organization.</p> : <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{noOrg.map((c) => <li key={c.id} style={{ padding: '4px 0' }}><Link className="link" href={`/ops/contacts/${c.id}`}>{c.name}</Link></li>)}</ul>}
      </section>

      <section className="card" aria-labelledby="pm">
        <h2 id="pm">Projects not on the map <span className="muted" style={{ fontWeight: 500 }}>{Math.min(offMapN, 500)}</span></h2>
        <p className="small muted" style={{ margin: '6px 0 12px' }}>Published projects with no location. They appear in lists but not on the public map. Add a latitude and longitude, or set a county location.</p>
        <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}><table className="t"><tbody>
          {offMap.map((p) => <tr key={p.id}><td><Link className="link" href={`/ops/projects/${p.id}`}>{p.name}</Link></td><td className="muted">{p.county ?? ''}</td></tr>)}
          {offMap.length === 0 && <tr><td className="muted">Every published project is on the map.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="card" aria-labelledby="sr">
        <h2 id="sr">Sources to look at again <span className="muted" style={{ fontWeight: 500 }}>{recheck.length}</span></h2>
        {recheck.length === 0 ? <p className="muted small" style={{ marginTop: 8 }}>Every fetched source ran within the last 30 days.</p> : <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>{recheck.map((s) => <li key={s.id} className="small" style={{ padding: '4px 0' }}><Link className="link" href="/ops/sources">{s.name}</Link> · {s.why} · last {relativeDays(s.last_fetched_at)}</li>)}</ul>}
      </section>
    </OpsPage>
  );
}
