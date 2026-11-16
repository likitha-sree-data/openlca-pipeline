import type { Metadata } from 'next';
import Link from 'next/link';
import Calculator from '@/components/public/Calculator';
import { all } from '@/lib/db';

export const metadata: Metadata = { title: 'Funding calculator', description: 'Estimate what defensible space would cost your community and how far a grant goes.' };

export default function CalculatorPage() {
  const benchmarks = all<{ name: string; cost_per_acre: number }>('SELECT name, cost_per_acre FROM calculator_benchmarks ORDER BY sort, id').map((b) => ({ name: b.name, costPerAcre: b.cost_per_acre }));
  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="page-title">
        <h1>What would defensible space cost your community?</h1>
        <p>Enter your homes, clear zone and share to treat. The estimate uses cost per acre from published local programs and shows how far a grant goes.</p>
        <p style={{ marginTop: 18 }}><Link className="btn" href="/funding">Browse funding programs →</Link></p>
      </div>
      <Calculator benchmarks={benchmarks} />
    </div>
  );
}
