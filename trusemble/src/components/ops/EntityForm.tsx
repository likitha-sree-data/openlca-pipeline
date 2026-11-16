'use client';

import { useFormAction } from '@/components/useFormAction';
import Link from 'next/link';
import type { Field } from '@/lib/entities';
import type { ActionState } from '@/app/ops/actions';
import { RefPicker } from './RefPicker';

export function EntityForm({
  fields, values, refLabels, userOpts, action, submitLabel, cancelHref,
}: {
  fields: Field[];
  values: Record<string, string | number | null | undefined>;
  refLabels: Record<string, string>;
  userOpts: [string, string][];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, onSubmit, pending] = useFormAction(action, {} as ActionState);
  const err = state.fieldErrors ?? {};
  const val = (n: string) => (state.values?.[n] ?? values[n] ?? '') as string | number;
  const groups: { name: string; fields: Field[] }[] = [];
  for (const f of fields) {
    const g = f.group ?? '';
    const last = groups[groups.length - 1];
    if (last && last.name === g) last.fields.push(f);
    else groups.push({ name: g, fields: [f] });
  }
  return (
    <form onSubmit={onSubmit} method="post" noValidate>
      {state.error && <div className="alert bad" role="alert" style={{ marginBottom: 16 }}>{state.error}</div>}
      {state.ok && state.message && <div className="alert ok" role="status" style={{ marginBottom: 16 }}>{state.message}</div>}
      {groups.map((g, gi) => (
        <div key={gi} className={gi > 0 ? 'form-group' : undefined}>
          {g.name && <h3>{g.name}</h3>}
          <div className="form-grid">
            {g.fields.map((f) => {
              const e = err[f.name];
              const common = { id: f.name, name: f.name, 'aria-invalid': !!e, 'aria-describedby': e ? `${f.name}-err` : f.help ? `${f.name}-help` : undefined } as const;
              let control: React.ReactNode;
              switch (f.type) {
                case 'textarea': control = <textarea {...common} className="textarea" defaultValue={val(f.name)} />; break;
                case 'select': control = (
                  <select {...common} className="select" defaultValue={String(val(f.name))}>
                    {!f.required && <option value="">None</option>}
                    {f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>); break;
                case 'checkbox': control = <label className="check"><input type="checkbox" name={f.name} id={f.name} defaultChecked={Number(val(f.name)) === 1 || val(f.name) === 'on'} /> {f.label}</label>; break;
                case 'ref':
                  control = f.ref === 'users'
                    ? <select {...common} className="select" defaultValue={String(val(f.name))}><option value="">Unassigned</option>{userOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    : <RefPicker name={f.name} id={f.name} kind={f.ref!} initialId={val(f.name) ? Number(val(f.name)) : null} initialLabel={refLabels[f.name]} invalid={!!e} />;
                  break;
                case 'number': control = <input {...common} className="input" inputMode="decimal" defaultValue={val(f.name)} />; break;
                default: control = <input {...common} className="input" type={f.type === 'tags' ? 'text' : f.type} defaultValue={val(f.name)} placeholder={f.placeholder} list={f.suggestions ? `${f.name}-sug` : undefined} />;
              }
              return (
                <div key={f.name} className={`field${f.wide || f.type === 'textarea' ? ' wide' : ''}`}>
                  {f.type !== 'checkbox' && <label htmlFor={f.name}>{f.label}{f.required && <span aria-hidden style={{ color: 'var(--danger)' }}> *</span>}</label>}
                  {control}
                  {f.help && !e && <span className="help" id={`${f.name}-help`}>{f.help}</span>}
                  {e && <span className="err" id={`${f.name}-err`} role="alert">{e}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="form-actions">
        <button className="btn primary" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        {cancelHref && <Link href={cancelHref} className="btn ghost">Cancel</Link>}
      </div>
    </form>
  );
}
