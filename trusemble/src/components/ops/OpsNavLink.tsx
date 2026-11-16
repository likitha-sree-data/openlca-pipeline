'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function OpsNavLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  const path = usePathname();
  const on = href === '/ops' ? path === '/ops' : path === href || path.startsWith(href + '/');
  return <Link href={href} className="ico" aria-label={label} title={label} aria-current={on ? 'page' : undefined}>{children}</Link>;
}
