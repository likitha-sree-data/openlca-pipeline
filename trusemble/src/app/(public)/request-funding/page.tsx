import type { Metadata } from 'next';
import { RequestWizard } from '@/components/public/forms';
import { ORG_TYPES, PROJECT_CATEGORIES, STATE_OPTS } from '@/lib/constants';

export const metadata: Metadata = { title: 'Request funding', description: 'Describe the project and what it needs. We look for matching programs, funders and partners and reply by email.' };

export default async function RequestFundingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const num = (v?: string) => (v && /^\d{1,12}$/.test(v) ? v : undefined);
  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="page-title">
        <h1>Request funding</h1>
        <p>Describe the project and what it needs. We look for matching programs, funders and partners and reply by email.</p>
      </div>
      <RequestWizard
        categories={PROJECT_CATEGORIES.map((c) => [c[0], c[1]])} states={STATE_OPTS.map((s) => [s[0], s[1]])} orgTypes={ORG_TYPES.map((o) => [o[0], o[1]])}
        prefill={{ amount: num(sp.amount), homes: num(sp.homes), projectId: num(sp.projectId), projectName: sp.projectName?.slice(0, 200) }}
      />
    </div>
  );
}
