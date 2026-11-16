'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { groupFor } from '@/lib/entities';

/** The tabs for whichever of the five places you are in. */
export function SectionTabs() {
  const path = usePathname();
  const g = groupFor(path);
  if (!g || g.tabs.length < 2) return null;
  const on = (href: string) => (href === '/ops' ? path === '/ops' : path === href || path.startsWith(href + '/'));
  return (
    <nav className="tabs" aria-label={g.label} style={{ marginBottom: 18 }}>
      {g.tabs.map((t) => <Link key={t.href} href={t.href} className={on(t.href) ? 'on' : ''} aria-current={on(t.href) ? 'page' : undefined}>{t.label}</Link>)}
    </nav>
  );
}
