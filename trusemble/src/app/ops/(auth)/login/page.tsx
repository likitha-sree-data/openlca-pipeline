import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { currentUser } from '@/lib/auth';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = { title: 'Operator sign in', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect('/ops');
  const { next } = await searchParams;
  return (
    <div className="login">
      <Logo />
      <h1 style={{ fontSize: 28, margin: '28px 0 6px' }}>Operations sign in</h1>
      <p className="muted" style={{ marginBottom: 20 }}>For the TruSemble team. Contacts and private records live behind this page.</p>
      <LoginForm next={next?.startsWith('/ops') ? next : ''} />
    </div>
  );
}
