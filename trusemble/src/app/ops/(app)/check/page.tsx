import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { OpsPage } from '@/components/ops/Shell';
import { checkDetail, checkQueue, checkTotal, checkedByUserToday } from '@/lib/check';
import { requireUser } from '@/lib/auth';
import { checkRecordAction } from '@/app/ops/actions';
import { safeHref } from '@/lib/safe-url';
import { fmtInt } from '@/lib/format';

export const metadata: Metadata = { title: 'Check the data' };

const NOUN: Record<string, string> = { funding: 'funding program', projects: 'project', organizations: 'organization' };

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const queue = checkQueue(200);
  const total = checkTotal();
  const n = Math.min(Math.max(0, Number(sp.n) || 0), Math.max(0, queue.length - 1));
  const item = queue[n];
  const d = item ? checkDetail(item.slug, item.id) : null;
  const href = d ? safeHref(d.link) : null;

  return (
    <OpsPage section="Check data">
      <h1>Check the data</h1>
      <p className="lede">Compare each record with where it came from. About a minute each. If it matches, say so. If not, fix it first.</p>
      <p className="small muted" style={{ marginTop: 8 }}>You checked {checkedByUserToday(user.id)} today · {fmtInt(total)} waiting</p>

      {!item || !d ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h2>Nothing is waiting to be checked</h2>
          <p className="card-sub" style={{ marginTop: 8 }}>New records appear here as soon as they are added or fetched from a source.</p>
          <p className="row" style={{ marginTop: 14 }}><Link className="btn" href="/ops/imports">Import a file</Link><Link className="btn" href="/ops/sources">See sources</Link></p>
        </div>
      ) : (
        <>
          <p className="small" style={{ margin: '20px 0 10px' }}>Record {n + 1} of {Math.min(queue.length, 200)} · a {NOUN[item.slug]}</p>
          <div className="detail-grid" style={{ marginTop: 0 }}>
            <section className="card" style={{ marginTop: 0 }} aria-labelledby="have">
              <h2 id="have">What we have</h2>
              <h3 style={{ fontSize: 22, margin: '10px 0 14px' }}>{d.name}</h3>
              <dl className="kv-list" style={{ gridTemplateColumns: '150px 1fr' }}>
                {d.fields.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
              <p style={{ marginTop: 16 }}><Link className="link small" href={`/ops/${item.slug}/${item.id}`}>Open the full record to edit it</Link></p>
            </section>
            <section className="card" style={{ marginTop: 0 }} aria-labelledby="src">
              <h2 id="src">Where it came from</h2>
              {d.source ? (
                <>
                  <p style={{ margin: '10px 0 4px' }}><b>{d.source.name}</b></p>
                  {d.source.description && <p className="small muted">{d.source.description}</p>}
                </>
              ) : <p className="muted" style={{ marginTop: 10 }}>No source is recorded. Find one before marking this checked, or leave it for now.</p>}
              {d.sourceRef && <p className="small" style={{ marginTop: 10 }}>Look for: <b>{d.sourceRef}</b></p>}
              {href ? <p style={{ marginTop: 16 }}><a className="btn primary" href={href} target="_blank" rel="noopener noreferrer">Open the original <ExternalLink size={15} aria-hidden /></a></p> : <p className="small muted" style={{ marginTop: 16 }}>There is no link to open.</p>}
            </section>
          </div>

          <form action={checkRecordAction} className="card" style={{ marginTop: 16 }}>
            <input type="hidden" name="slug" value={item.slug} /><input type="hidden" name="id" value={item.id} />
            <div className="field" style={{ maxWidth: 520 }}><label htmlFor="note">Note (optional)</label><input id="note" name="note" className="input" maxLength={300} placeholder="What you looked at, or what you changed" /></div>
            <div className="form-actions">
              <button name="outcome" value="confirmed" className="btn primary">It matches the source</button>
              <button name="outcome" value="corrected" className="btn">I fixed it, now it matches</button>
              <Link className="btn ghost" href={`/ops/check?n=${n + 1}`} aria-disabled={n + 1 >= queue.length}>Skip for now</Link>
            </div>
          </form>
        </>
      )}
    </OpsPage>
  );
}
