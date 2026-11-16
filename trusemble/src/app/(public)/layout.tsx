import { SiteFooter, SiteHeader } from '@/components/public/Chrome';
import { includeDemo } from '@/lib/visibility';
import { scalar } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const demoRows = includeDemo() ? scalar<number>(`SELECT COUNT(*) FROM projects WHERE verification = 'demo'`) : 0;
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      {demoRows > 0 && <div className="demo-banner" role="note">Demo data is switched on: rows labelled "(Demo)" are generated, not real records.</div>}
      <SiteHeader />
      <main id="content">{children}</main>
      <SiteFooter />
    </>
  );
}
