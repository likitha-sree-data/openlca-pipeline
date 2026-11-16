'use client';
import { useFormAction } from '@/components/useFormAction';
import { saveBenchmarkAction, type ActionState } from '@/app/ops/actions';

type B = { name: string; cost_per_acre: number; source_url: string | null; note: string | null; verification: string };

export function BenchmarkForm({ id, initial }: { id: number | null; initial?: B }) {
  const [s, onSubmit, pending] = useFormAction(saveBenchmarkAction.bind(null, id), {} as ActionState);
  const k = id ?? 'new';
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      {s.ok && <div className="alert ok" role="status">{s.message}</div>}
      <div className="form-grid">
        <div className="field"><label htmlFor={`n-${k}`}>Program</label><input id={`n-${k}`} name="name" className="input" defaultValue={initial?.name} required maxLength={300} /></div>
        <div className="field"><label htmlFor={`c-${k}`}>Cost per acre ($)</label><input id={`c-${k}`} name="cost_per_acre" className="input" inputMode="decimal" defaultValue={initial?.cost_per_acre} required /></div>
        <div className="field"><label htmlFor={`u-${k}`}>Program page</label><input id={`u-${k}`} name="source_url" type="url" className="input" defaultValue={initial?.source_url ?? ''} placeholder="https://" /></div>
        <div className="field"><label htmlFor={`t-${k}`}>Note</label><input id={`t-${k}`} name="note" className="input" defaultValue={initial?.note ?? ''} /></div>
        <label className="check"><input type="checkbox" name="verified" defaultChecked={initial?.verification === 'verified'} /> Checked against the program page</label>
      </div>
      <button className="btn primary sm" style={{ justifySelf: 'start' }} disabled={pending}>{pending ? 'Saving…' : id ? 'Save' : 'Add benchmark'}</button>
    </form>
  );
}
