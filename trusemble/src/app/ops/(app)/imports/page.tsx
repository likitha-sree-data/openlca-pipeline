import type { Metadata } from 'next';
import Link from 'next/link';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead } from '@/components/ops/ui';
import { all } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';
import { UploadForm } from './UploadForm';

export const metadata: Metadata = { title: 'Imports' };

type Result = { new?: number; updated?: number; unchanged?: number; conflicts?: number; invalid?: number };
const resultText = (r: Result | null) => r ? [r.new && `${r.new} new`, r.updated && `${r.updated} updated`, r.unchanged && `${r.unchanged} unchanged`, r.conflicts && `${r.conflicts} conflicts`, r.invalid && `${r.invalid} invalid`].filter(Boolean).join(' · ') || 'No rows' : '';

export default function ImportsPage() {
  const rows = all<{ id: number; filename: string; format: string | null; sheets: string | null; entity: string | null; result: string | null; problems: string | null; status: string; by: string | null; created_at: string }>(
    `SELECT i.id, i.filename, i.format, i.sheets, i.entity, i.result, i.problems, i.status, u.name by, i.created_at FROM imports i LEFT JOIN users u ON u.id = i.user_id ORDER BY i.id DESC LIMIT 100`,
  );
  return (
    <OpsPage section="Check data">
      <PageHead title="Import a file">Bring in a spreadsheet of groups, contacts, requests or projects. Anything already on file is updated, never added twice.</PageHead>
      <div className="stack" style={{ marginTop: 18 }}>
        <section className="card" style={{ marginTop: 0 }}><h2 style={{ fontSize: 18 }}>Upload a spreadsheet</h2><p className="card-sub" style={{ marginBottom: 14 }}>Nothing is saved until you review the rows and press apply on the next screen.</p><UploadForm /></section>
        <section className="card" style={{ marginTop: 0 }}>
          <h2 style={{ fontSize: 18 }}>What you can import</h2>
          <ul style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
            <li>A CSV or Excel (.xlsx) file up to 10 MB, one row per record. Workbooks with several sheets are fine.</li>
            <li>Any column layout. You match each column to a field (name, county, email, amount and so on) before anything is saved.</li>
            <li>Known layouts fill in on their own: TruSemble Followups (fups.xlsx).</li>
            <li>You see every new record and every change before you apply it. Imported records start as "not yet checked" until a person checks them. A value that disagrees with something already checked is flagged as a problem instead of replacing it.</li>
          </ul>
        </section>
      </div>
      <p style={{ margin: '28px 0 10px' }}><b style={{ fontSize: 18 }}>Past imports</b> <span className="muted small">{rows.length} runs, newest first. Running the same file again updates what changed and leaves the rest unchanged.</span></p>
      <div className="table-wrap"><table className="t">
        <thead><tr><th>File</th><th>Format</th><th>Result</th><th>Problems</th><th>Status</th><th>By</th><th>When</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No imports yet.</td></tr>}
          {rows.map((r) => {
            const res = r.result ? (JSON.parse(r.result) as Result) : null;
            const probs = r.problems ? (JSON.parse(r.problems) as string[]) : [];
            return (
              <tr key={r.id}>
                <td className="name"><Link href={`/ops/imports/${r.id}`}>{r.filename}</Link>{r.sheets && <span className="sub">Sheets: {(JSON.parse(r.sheets) as string[]).join(', ')}</span>}</td>
                <td>{r.format}</td><td>{resultText(res)}</td><td>{probs.length ? `${probs.length}` : 'None'}</td>
                <td><span className={`pill ${r.status === 'applied' ? 'ok' : r.status === 'failed' ? 'bad' : 'info'}`}>{r.status === 'applied' ? 'Completed' : r.status[0].toUpperCase() + r.status.slice(1)}</span></td>
                <td>{r.by}</td><td className="nowrap">{fmtDateTime(r.created_at)}</td>
              </tr>);
          })}
        </tbody>
      </table></div>
    </OpsPage>
  );
}
