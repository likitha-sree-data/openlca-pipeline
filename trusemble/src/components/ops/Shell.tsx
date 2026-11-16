import Link from 'next/link';
import { CalendarCheck, ClipboardCheck, FolderKanban, Settings, Users } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { OPS_GROUPS } from '@/lib/entities';
import { logoutAction } from '@/app/ops/actions';
import type { User } from '@/lib/auth';
import { OpsNavLink } from './OpsNavLink';
import { SectionTabs } from './SectionTabs';

const ICONS: Record<string, React.ReactNode> = {
  today: <CalendarCheck size={22} />, people: <Users size={22} />, projects: <FolderKanban size={22} />, check: <ClipboardCheck size={22} />, settings: <Settings size={22} />,
};

export function Shell({ user, children }: { user: User; children: React.ReactNode }) {
  return (
    <div className="ops">
      <nav className="rail" aria-label="Team tool">
        <Link href="/" className="brand" aria-label="Public site"><LogoMark size={34} /></Link>
        {OPS_GROUPS.map((g) => <OpsNavLink key={g.key} groupKey={g.key} href={g.href} label={g.label}>{ICONS[g.key]}</OpsNavLink>)}
        <div className="me">
          <span title={user.name}>{user.name.split(' ')[0]}</span>
          <form action={logoutAction}><button type="submit">Sign out</button></form>
        </div>
      </nav>
      <div className="ops-main">{children}</div>
    </div>
  );
}

export function Topbar({ section }: { section: string }) {
  return (
    <header className="topbar">
      <div className="crumbs"><b>{section}</b></div>
      <Link href="/ops/requests/new" className="btn sm">+ Add a request</Link>
    </header>
  );
}

export function OpsPage({ section, children }: { section: string; children: React.ReactNode }) {
  return (
    <>
      <Topbar section={section} />
      <div className="ops-content">
        <SectionTabs />
        {children}
      </div>
    </>
  );
}
