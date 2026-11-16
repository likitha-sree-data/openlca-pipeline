'use client';
import { useState } from 'react';
import { useFormAction } from '@/components/useFormAction';
import { saveMappingAction, type ActionState } from '@/app/ops/actions';
import { guessMapping, type ImportEntity } from '@/lib/import/fields';
import type { Mapping } from '@/lib/import/plan';

type Sheet = { name: string; headers: string[]; sample: Record<string, string>[]; count: number };
type FieldSpec = { name: string; label: string; required: boolean };

export function MappingForm({ importId, entity: initialEntity, mapping, sheets, fields }: { importId: number; entity: ImportEntity; mapping: Mapping; sheets: Sheet[]; fields: Record<string, FieldSpec[]> }) {
  const [s, onSubmit, pending] = useFormAction(saveMappingAction.bind(null, importId), {} as ActionState);
  const [entity, setEntity] = useState<ImportEntity>(initialEntity);
  const [cols, setCols] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(sheets.map((sh) => [sh.name, mapping.sheets[sh.name]?.columns ?? guessMapping(initialEntity, sh.headers)])));
  const changeEntity = (e: ImportEntity) => { setEntity(e); setCols(Object.fromEntries(sheets.map((sh) => [sh.name, guessMapping(e, sh.headers)]))); };
  const opts = fields[entity];
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      <div className="card" style={{ marginTop: 0 }}>
        <div className="field" style={{ maxWidth: 360 }}><label htmlFor="entity">Each row is a</label>
          <select id="entity" name="entity" className="select" value={entity} onChange={(e) => changeEntity(e.target.value as ImportEntity)}>
            <option value="organizations">Organization</option><option value="contacts">Contact</option><option value="requests">Request (fundraising or client pipeline)</option><option value="projects">Project</option>
          </select></div>
        <p className="small muted" style={{ marginTop: 8 }}>Required: {opts.filter((f) => f.required).map((f) => f.label).join(', ')}. Existing rows are matched by name{entity === 'contacts' ? ' or email' : entity === 'requests' ? ' or reference' : ''}.</p>
      </div>
      {sheets.map((sh, si) => (
        <section key={sh.name} className="card" style={{ marginTop: 0 }}>
          <div className="card-head"><h2 style={{ fontSize: 17 }}>Sheet: {sh.name}</h2><label className="check"><input type="checkbox" name={`include-${si}`} defaultChecked={sh.count > 0 && (mapping.sheets[sh.name]?.include ?? true)} /> Include ({sh.count} rows)</label></div>
          {sh.headers.length === 0 ? <p className="muted small">No columns found.</p> : (
            <div className="table-wrap" style={{ marginTop: 10 }}><table className="t">
              <thead><tr><th>Column</th><th>Sample</th><th>Import as</th></tr></thead>
              <tbody>{sh.headers.map((h, hi) => (
                <tr key={h}><td className="name">{h}</td><td className="small muted" style={{ maxWidth: 280 }}>{sh.sample.map((r) => r[h]).filter(Boolean).slice(0, 2).join(' · ')}</td>
                  <td><label className="sr-only" htmlFor={`m-${si}-${hi}`}>Field for {h}</label>
                    <select id={`m-${si}-${hi}`} name={`map-${si}-${hi}`} className="select" value={cols[sh.name]?.[h] ?? ''} onChange={(e) => setCols((c) => ({ ...c, [sh.name]: { ...c[sh.name], [h]: e.target.value } }))}>
                      <option value="">Ignore</option>{opts.map((f) => <option key={f.name} value={f.name}>{f.label}{f.required ? ' *' : ''}</option>)}
                    </select></td></tr>))}</tbody>
            </table></div>)}
        </section>
      ))}
      <div><button className="btn primary" disabled={pending}>{pending ? 'Checking…' : 'Review changes'}</button></div>
    </form>
  );
}
