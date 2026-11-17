'use client';
import { useFormAction } from '@/components/useFormAction';
import { publishAction, type ActionState } from '@/app/ops/actions';

export function PublishForm({ table, id, show, disabled }: { table: 'projects' | 'programs'; id: number; show: boolean; disabled?: boolean }) {
  const [s, onSubmit, pending] = useFormAction(publishAction.bind(null, table, id, show), {} as ActionState);
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      {s.ok && <div className="alert ok" role="status">{s.message}</div>}
      <button className={`btn sm ${show ? 'primary' : ''}`} style={{ justifySelf: 'start' }} disabled={pending || disabled}>{pending ? 'Saving…' : show ? 'Show it on the website' : 'Hide it from the website'}</button>
    </form>
  );
}
