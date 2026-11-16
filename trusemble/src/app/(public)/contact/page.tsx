import type { Metadata } from 'next';
import { ContactForm } from '@/components/public/forms';

export const metadata: Metadata = { title: 'Contact the team', description: 'Fund a project, get the monthly brief, or talk to the team about the data.' };
const TOPICS = ['Fund a project', 'Monthly brief or data license', 'Talk to the team about the data', 'Something else'];

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="container narrow" style={{ paddingBottom: 48 }}>
      <div className="page-title"><h1>Contact the team</h1><p>Fund a project, get the monthly brief, or talk to the team about the data.</p></div>
      <ContactForm topics={TOPICS} defaultTopic={TOPICS.includes(sp.topic ?? '') ? sp.topic : undefined} />
    </div>
  );
}
