'use client';
import { useFormAction } from '@/components/useFormAction';
import { saveSourceAction, type ActionState } from '@/app/ops/actions';
import { SOURCE_KINDS } from '@/lib/constants';

export function SourceForm() {
  const [s, onSubmit, pending] = useFormAction(saveSourceAction, {} as ActionState);
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      {s.ok && <div className="alert ok" role="status">{s.message}</div>}
      <div className="form-grid">
        <div className="field wide"><label htmlFor="s-name">Name</label><input id="s-name" name="name" className="input" required maxLength={300} /></div>
        <div className="field"><label htmlFor="s-url">Link</label><input id="s-url" name="url" type="url" className="input" placeholder="https://" /></div>
        <div className="field"><label htmlFor="s-kind">Kind</label><select id="s-kind" name="kind" className="select">{SOURCE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field wide"><label htmlFor="s-desc">What it feeds, and what is left out</label><textarea id="s-desc" name="description" className="textarea" style={{ minHeight: 70 }} /></div>
        <label className="check"><input type="checkbox" name="is_private" /> Private (not shown in the public ledger)</label>
      </div>
      <button className="btn primary sm" style={{ justifySelf: 'start' }} disabled={pending}>{pending ? 'Saving…' : 'Add source'}</button>
    </form>
  );
}
