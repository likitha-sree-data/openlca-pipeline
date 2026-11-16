'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu } from 'lucide-react';

export const NAV = [
  { href: '/projects', label: 'Projects' },
  { href: '/funding', label: 'Funding' },
  { href: '/data', label: 'Data' },
  { href: '/calculator', label: 'Calculator' },
  { href: '/request-funding', label: 'Request funding' },
  { href: '/contact', label: 'Contact' },
];

const active = (path: string, href: string) => path === href || path.startsWith(href + '/');

export function DesktopNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
    </nav>
  );
}

export function MobileMenu() {
  const path = usePathname();
  return (
    <details className="menu">
      <summary className="menu-btn" aria-label="Menu"><Menu size={20} aria-hidden /></summary>
      <div className="menu-panel">
        {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? 'page' : undefined}>{n.label}</Link>)}
        <Link href="/submit-project" className="link">Submit a project</Link>
      </div>
    </details>
  );
}
