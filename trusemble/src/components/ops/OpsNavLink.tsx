'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { groupFor } from '@/lib/entities';

/** One of the five places. Lit up whenever you are on any of its pages. */
export function OpsNavLink({ groupKey, href, label, children }: { groupKey: string; href: string; label: string; children: React.ReactNode }) {
  const path = usePathname();
  const on = groupFor(path)?.key === groupKey;
  return (
    <Link href={href} className="ico" aria-label={label} aria-current={on ? 'page' : undefined}>
      {children}
      <span>{label}</span>
    </Link>
  );
}
