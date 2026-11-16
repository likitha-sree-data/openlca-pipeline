import { requireUser } from '@/lib/auth';
import { Shell } from '@/components/ops/Shell';

export const dynamic = 'force-dynamic';

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <Shell user={user}><main id="content">{children}</main></Shell>;
}
