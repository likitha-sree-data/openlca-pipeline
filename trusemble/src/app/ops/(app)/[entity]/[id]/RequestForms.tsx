'use client';
import { useFormAction } from '@/components/useFormAction';
import { introducedAction, nextStepAction, type ActionState } from '@/app/ops/actions';

export function NextStepForm({ id, ownerId, date, text, users }: { id: number; ownerId: number | null; date: string | null; text: string | null; users: [string, string][] }) {
  const [s, onSubmit, pending] = useFormAction(nextStepAction.bind(null, id), {} as ActionState);
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      {s.ok && <div className="alert ok" role="status">{s.message}</div>}
      <div className="field"><label htmlFor="ns-text">What happens next?</label><input id="ns-text" name="next_action" className="input" defaultValue={text ?? ''} maxLength={300} placeholder="For example: email them the program list" /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="ns-owner">Who does it?</label><select id="ns-owner" name="owner_id" className="select" defaultValue={ownerId ?? ''}><option value="">Nobody yet</option>{users.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="ns-date">By when?</label><input id="ns-date" name="next_action_date" type="date" className="input" defaultValue={date ?? ''} /></div>
      </div>
      <button className="btn primary sm" style={{ justifySelf: 'start' }} disabled={pending}>{pending ? 'Saving…' : 'Save next step'}</button>
    </form>
  );
}

export function IntroducedForm({ id }: { id: number }) {
  const [s, onSubmit, pending] = useFormAction(introducedAction.bind(null, id), {} as ActionState);
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      {s.ok && <div className="alert ok" role="status">{s.message}</div>}
      <div className="field"><label htmlFor="intro-note">Who did you introduce to whom?</label><input id="intro-note" name="note" className="input" maxLength={500} placeholder="For example: Ridge HOA to the Bend Foundation program officer" required /></div>
      <button className="btn primary sm" style={{ justifySelf: 'start' }} disabled={pending}>{pending ? 'Saving…' : 'Record the introduction'}</button>
    </form>
  );
}
