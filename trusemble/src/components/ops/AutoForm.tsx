'use client';
import type { ReactNode } from 'react';

/** GET form that re-submits whenever a select changes. Falls back to the Apply button without JavaScript. */
export function AutoForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form method="get" className={className} onChange={(e) => { if ((e.target as HTMLElement).tagName === 'SELECT') (e.currentTarget as HTMLFormElement).requestSubmit(); }}>
      {children}
    </form>
  );
}
