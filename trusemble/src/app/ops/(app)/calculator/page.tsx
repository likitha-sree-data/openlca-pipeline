import type { Metadata } from 'next';
import Link from 'next/link';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead, VerifPill } from '@/components/ops/ui';
import { all } from '@/lib/db';
import { estimate } from '@/lib/calculator';
import { fmtMoney } from '@/lib/format';
import { BenchmarkForm } from './BenchmarkForm';
import { deleteBenchmarkAction } from '@/app/ops/actions';

export const metadata: Metadata = { title: 'Calculator' };

export default async function OpsCalculator() {
  const rows = await all<{ id: number; name: string; cost_per_acre: number; source_url: string | null; note: string | null; verification: string }>('SELECT * FROM calculator_benchmarks ORDER BY sort, id');
  const r = estimate({ homes: 300, clearZoneFt: 100, sharePct: 50, grant: 75000 }, rows.map((b) => ({ name: b.name, costPerAcre: b.cost_per_acre })));
  return (
    <OpsPage section="Calculator">
      <PageHead title="Funding calculator">The public calculator prices defensible space from cost per acre in published local programs. Maintain those benchmarks here. Each one should link to the program page it came from.</PageHead>
      {r && <div className="card" style={{ marginTop: 18 }}><p className="small muted">Check against the default inputs (300 homes, 100 ft clear zone, 50% treated, $75,000 grant)</p>
        <p style={{ marginTop: 6 }}>Average <b className="num">{fmtMoney(r.avgCost)}</b> · range {fmtMoney(r.lowCost)} to {fmtMoney(r.highCost)} · the grant covers <b>{(r.coverage * 100).toFixed(1)}%</b> · <Link className="link" href="/calculator">Open the public calculator</Link></p></div>}
      <div className="stack" style={{ marginTop: 18 }}>
        {rows.map((b) => (
          <section key={b.id} className="card" style={{ marginTop: 0 }}>
            <div className="card-head"><h2 style={{ fontSize: 16 }}>{b.name}</h2><span className="row"><VerifPill v={b.verification} /><form action={deleteBenchmarkAction.bind(null, b.id)}><button className="btn sm danger">Delete</button></form></span></div>
            <BenchmarkForm id={b.id} initial={b} />
          </section>
        ))}
        <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 16, marginBottom: 12 }}>Add a benchmark</h2><BenchmarkForm id={null} /></section>
      </div>
    </OpsPage>
  );
}
