import type { ReactNode } from 'react';

export function Field({ label, name, error, help, children, wide }: { label: string; name: string; error?: string; help?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label htmlFor={name}>{label}</label>
      {children}
      {help && !error && <span className="help" id={`${name}-help`}>{help}</span>}
      {error && <span className="err" id={`${name}-err`} role="alert">{error}</span>}
    </div>
  );
}

export function StatusMessage({ error, ok, children }: { error?: string; ok?: boolean; children?: ReactNode }) {
  if (error) return <div className="alert bad" role="alert">{error}</div>;
  if (ok) return <div className="alert ok" role="status">{children}</div>;
  return null;
}

export const stateOptions = (opts: readonly (readonly [string, string])[]) =>
  opts.map(([v, l]) => <option key={v} value={v}>{l}</option>);
