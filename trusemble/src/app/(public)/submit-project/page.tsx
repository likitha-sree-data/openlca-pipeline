import type { Metadata } from 'next';
import { SubmitProjectForm } from '@/components/public/forms';
import { PROJECT_CATEGORIES, STATE_OPTS } from '@/lib/constants';

export const metadata: Metadata = { title: 'Submit a project', description: 'Put a wildfire mitigation project on the record. A person reads every submission; nothing is published automatically.' };

export default function SubmitProjectPage() {
  return (
    <div className="container narrow" style={{ paddingBottom: 48 }}>
      <div className="page-title">
        <h1>Submit a project</h1>
        <p>Put a wildfire mitigation project on the record. A person reads every submission and checks it against a source before it is published. Your name, email and phone stay private.</p>
      </div>
      <SubmitProjectForm categories={PROJECT_CATEGORIES.map((c) => [c[0], c[1]])} states={STATE_OPTS.map((s) => [s[0], s[1]])} />
    </div>
  );
}
