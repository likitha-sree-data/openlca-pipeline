import Link from 'next/link';
import { CHECK_LABEL, REQUEST_STATUS_PILL } from '@/lib/constants';
import { fmtInt } from '@/lib/format';

export function Split({ v, u, d }: { v: number; u: number; d: number }) {
  return (
    <span className="split">
      <span><b className="num">{fmtInt(v)}</b> checked</span>
      <span><b className="num">{fmtInt(u)}</b> not yet checked</span>
      <span><b className="num">{fmtInt(d)}</b> sample</span>
    </span>
  );
}

export const SplitOf = ({ s }: { s: { verified: number; unverified: number; demo: number } }) => <Split v={s.verified} u={s.unverified} d={s.demo} />;

export function StatusPill({ status }: { status: string }) {
  const cls = status === 'new' || status === 'needs_info' ? 'new' : status === 'closed' ? 'quiet' : status === 'intro_made' ? 'ok' : 'info';
  return <span className={`pill ${cls}`}>{REQUEST_STATUS_PILL[status] ?? status}</span>;
}

export function Prio({ p }: { p: string | null }) {
  if (!p) return <span className="muted">–</span>;
  return <span className={`prio-${p}`}>{p[0].toUpperCase() + p.slice(1)}</span>;
}

export function VerifPill({ v }: { v: string }) {
  return <span className={`pill ${v === 'verified' ? 'ok' : v === 'demo' ? 'warn' : 'quiet'}`}>{CHECK_LABEL[v] ?? v}</span>;
}

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div><h1>{title}</h1>{children && <p className="lede">{children}</p>}</div>;
}

export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="link small">{children} →</Link>;
}
