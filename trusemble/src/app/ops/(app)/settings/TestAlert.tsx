'use client';
import { useFormAction } from '@/components/useFormAction';
import { sendTestAlertAction, type ActionState } from '@/app/ops/actions';

export function TestAlert() {
  const [s, onSubmit, pending] = useFormAction(sendTestAlertAction, {} as ActionState);
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      {s.ok && <div className="alert ok" role="status">{s.message}</div>}
      <button className="btn sm" style={{ justifySelf: 'start' }} disabled={pending}>{pending ? 'Sending…' : 'Send a test alert'}</button>
    </form>
  );
}
