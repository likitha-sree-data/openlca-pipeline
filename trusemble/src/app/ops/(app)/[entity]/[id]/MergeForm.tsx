'use client';
import { useFormAction } from '@/components/useFormAction';
import { mergeOrganizationAction, outreachAction, type ActionState } from '@/app/ops/actions';

export function MergeForm({ intoId, fromId, fromName }: { intoId: number; fromId: number; fromName: string }) {
  const [s, onSubmit, pending] = useFormAction(mergeOrganizationAction.bind(null, intoId, fromId), {} as ActionState);
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      {s.ok && <div className="alert ok" role="status">{s.message}</div>}
      <p className="small">Moves everything from <b>{fromName}</b> (projects, people, requests, money) into this group and archives it. This cannot be undone.</p>
      <button className="btn sm danger" style={{ justifySelf: 'start' }} disabled={pending}>{pending ? 'Merging…' : 'Merge it into this group'}</button>
    </form>
  );
}

export function OutreachForm({ contactId }: { contactId: number }) {
  const [s, onSubmit, pending] = useFormAction(outreachAction.bind(null, contactId), {} as ActionState);
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      {s.ok && <div className="alert ok" role="status">{s.message}</div>}
      <button className="btn sm primary" style={{ justifySelf: 'start' }} disabled={pending}>{pending ? 'Adding…' : 'Add to the outreach list'}</button>
    </form>
  );
}
