import type { Metadata } from 'next';
import Link from 'next/link';
import fs from 'node:fs';
import { notFound } from 'next/navigation';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead } from '@/components/ops/ui';
import { get } from '@/lib/db';
import { parseUpload, type ParsedFile } from '@/lib/import/parse';
import { buildPlan, type Mapping } from '@/lib/import/plan';
import { IMPORT_FIELDS, type ImportEntity } from '@/lib/import/fields';
import { applyImportAction, discardImportAction } from '@/app/ops/actions';
import { MappingForm } from './MappingForm';

export const metadata: Metadata = { title: 'Import' };

type Imp = { id: number; filename: string; stored_path: string | null; format: string | null; entity: ImportEntity; mapping: string; result: string | null; problems: string | null; status: string };

export default async function ImportDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const imp = get<Imp>('SELECT * FROM imports WHERE id = ?', Number(id));
  if (!imp) notFound();
  const { step } = await searchParams;
  const applied = imp.status === 'applied' || imp.status === 'failed';
  const mapping = JSON.parse(imp.mapping) as Mapping;

  if (applied) {
    const res = imp.result ? (JSON.parse(imp.result) as Record<string, number>) : null;
    const probs = imp.problems ? (JSON.parse(imp.problems) as string[]) : [];
    return (
      <OpsPage section="Imports">
        <p className="small"><Link className="link" href="/ops/imports">← Imports</Link></p>
        <PageHead title={imp.filename}>{imp.status === 'applied' ? 'This import was applied.' : 'This import failed and nothing was saved.'}</PageHead>
        {res && <div className="tiles" style={{ margin: '18px 0' }}>{Object.entries(res).map(([k, v]) => <div className="stat" key={k}><b className="num">{v}</b><span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</span></div>)}</div>}
        {probs.length > 0 && <div className="card"><h2 style={{ fontSize: 16 }}>Notes</h2><ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{probs.map((p, i) => <li key={i} className="small">{p}</li>)}</ul></div>}
        <p style={{ marginTop: 16 }}><Link className="btn" href="/ops/check">Start checking the new records</Link></p>
      </OpsPage>
    );
  }

  let parsed: ParsedFile;
  try {
    if (!imp.stored_path || !fs.existsSync(imp.stored_path)) throw new Error('The uploaded file is no longer available.');
    parsed = await parseUpload(imp.filename, fs.readFileSync(imp.stored_path));
  } catch (e) {
    return <OpsPage section="Imports"><div className="alert bad">{e instanceof Error ? e.message : 'The file could not be read.'}</div><p style={{ marginTop: 12 }}><Link className="btn" href="/ops/imports">Back</Link></p></OpsPage>;
  }

  if (step === 'review' && imp.status !== 'uploaded') {
    const plan = buildPlan(imp.entity, parsed.sheets, mapping);
    const s = plan.summary;
    const interesting = plan.items.filter((i) => i.action !== 'unchanged').slice(0, 200);
    return (
      <OpsPage section="Imports">
        <p className="small"><Link className="link" href={`/ops/imports/${imp.id}`}>← Back to column mapping</Link></p>
        <PageHead title={`Review ${imp.filename}`}>Nothing has been saved yet. Look over the rows below, then apply. Imported records start as not yet checked.</PageHead>
        <div className="tiles" style={{ margin: '18px 0' }}>
          {([['New', s.new], ['Updated', s.updated], ['Unchanged', s.unchanged], ['Conflicts', s.conflict], ['Invalid', s.invalid]] as const).map(([l, n]) => <div className="stat" key={l}><b className="num">{n}</b><span>{l}</span></div>)}
        </div>
        {s.conflict > 0 && <div className="alert" style={{ marginBottom: 14 }}>A conflict is a value that disagrees with a record a person already checked. It is not replaced. Each one becomes a problem you can look at under Check data.</div>}
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Sheet · row</th><th>Record</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {interesting.length === 0 && <tr><td colSpan={4} className="muted">Nothing would change.</td></tr>}
            {interesting.map((i, k) => (
              <tr key={k}>
                <td className="small nowrap">{i.sheet} · {i.row}</td><td className="name">{i.label}</td>
                <td><span className={`pill ${i.action === 'new' ? 'ok' : i.action === 'updated' ? 'info' : i.action === 'conflict' ? 'warn' : 'bad'}`}>{i.action}</span></td>
                <td className="small">{i.problem && <div className="muted">{i.problem}</div>}
                  {[...i.changes, ...i.conflicts].map((c) => <div className="diff" key={c.field}><span className="muted">{c.field}</span><span className="from">{String(c.from ?? '')}</span><span className="to">{String(c.to ?? '')}</span></div>)}
                  {i.action === 'new' && <span className="muted">{Object.entries(i.values).filter(([, v]) => v !== null && v !== '').slice(1, 5).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>}
                </td>
              </tr>))}
          </tbody>
        </table></div>
        {plan.items.filter((i) => i.action !== 'unchanged').length > 200 && <p className="small muted" style={{ marginTop: 8 }}>Showing the first 200 changes. All of them are applied.</p>}
        <div className="form-actions">
          <form action={applyImportAction.bind(null, imp.id)}><button className="btn primary" disabled={s.new + s.updated + s.conflict === 0}>Apply import</button></form>
          <form action={discardImportAction.bind(null, imp.id)}><button className="btn ghost">Discard</button></form>
        </div>
      </OpsPage>
    );
  }

  return (
    <OpsPage section="Imports">
      <p className="small"><Link className="link" href="/ops/imports">← Imports</Link></p>
      <PageHead title={`Match columns: ${imp.filename}`}>{imp.format}. Choose what each row is, then match each column to a field. Columns left as “Ignore” are not imported.</PageHead>
      <div style={{ marginTop: 18 }}>
        <MappingForm
          importId={imp.id} entity={imp.entity} mapping={mapping}
          sheets={parsed.sheets.map((s) => ({ name: s.name, headers: s.headers, sample: s.rows.slice(0, 3), count: s.rows.length }))}
          fields={Object.fromEntries(Object.entries(IMPORT_FIELDS).map(([k, v]) => [k, v.map((f) => ({ name: f.name, label: f.label, required: !!f.required }))]))}
        />
        <form action={discardImportAction.bind(null, imp.id)} style={{ marginTop: 10 }}><button className="btn ghost sm">Discard this upload</button></form>
      </div>
    </OpsPage>
  );
}
