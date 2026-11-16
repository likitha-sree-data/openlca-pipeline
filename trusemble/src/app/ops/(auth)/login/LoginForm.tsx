'use client';
import { useFormAction } from '@/components/useFormAction';
import { loginAction, type ActionState } from '../../actions';

export function LoginForm({ next }: { next: string }) {
  const [s, onSubmit, pending] = useFormAction(loginAction, {} as ActionState);
  return (
    <form onSubmit={onSubmit} method="post" className="card" style={{ display: 'grid', gap: 16 }}>
      <input type="hidden" name="next" value={next} />
      {s.error && <div className="alert bad" role="alert">{s.error}</div>}
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required autoComplete="username" autoFocus /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" className="input" required autoComplete="current-password" /></div>
      <button className="btn primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
