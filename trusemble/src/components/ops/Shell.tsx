import Link from 'next/link';
import { Building2, ClipboardCheck, Calculator, Database, FileUp, HandCoins, Inbox, LayoutGrid, Map as MapIcon, Target, TreePine, Users, ArrowLeftRight } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { OPS_NAV } from '@/lib/entities';
import { logoutAction } from '@/app/ops/actions';
import type { User } from '@/lib/auth';
import { OpsNavLink } from './OpsNavLink';

const ICONS: Record<string, React.ReactNode> = {
  overview: <LayoutGrid size={20} />, pilot: <Target size={20} />, requests: <Inbox size={20} />, projects: <TreePine size={20} />, matches: <ArrowLeftRight size={20} />,
  organizations: <Building2 size={20} />, contacts: <Users size={20} />, funding: <HandCoins size={20} />, map: <MapIcon size={20} />, sources: <Database size={20} />,
  imports: <FileUp size={20} />, 'data-quality': <ClipboardCheck size={20} />, calculator: <Calculator size={20} />,
};

export function Shell({ user, children }: { user: User; children: React.ReactNode }) {
  return (
    <div className="ops">
      <nav className="rail" aria-label="Operations">
        <Link href="/" className="brand" aria-label="Public site"><LogoMark size={34} /></Link>
        {OPS_NAV.map((n, i) => n === null ? <span key={i} className="gap" /> : <OpsNavLink key={n.key} href={n.href} label={n.label}>{ICONS[n.key]}</OpsNavLink>)}
        <div className="me">
          <span title={user.name}>{user.initials}</span>
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
      <div className="crumbs"><span>Operations</span><span aria-hidden>›</span><b>{section}</b></div>
      <Link href="/ops/requests/new" className="btn sm">New request</Link>
    </header>
  );
}

export function OpsPage({ section, children }: { section: string; children: React.ReactNode }) {
  return (
    <>
      <Topbar section={section} />
      <div className="ops-content">{children}</div>
    </>
  );
}
