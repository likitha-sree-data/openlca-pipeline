import type { Metadata } from 'next';
import Link from 'next/link';
import PublicMap from '@/components/public/PublicMap';
import { headline, layerCounts, listProjects, projectFilterOptions } from '@/lib/public-data';
import { PROJECT_STAGES } from '@/lib/constants';
import { categoriesOpts } from '@/lib/util-opts';
import { fmtInt } from '@/lib/format';

export const metadata: Metadata = { title: 'Project map', description: 'Every wildfire mitigation project in the record on one map, set against FEMA wildfire risk and county funding.' };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const h = await headline();
  const seeking = (await listProjects({ stage: 'seeking_funding' }, 1, 0)).total;
  return (
    <div className="container">
      <div className="page-title">
        <h1 style={{ maxWidth: 'none' }}>Wildfire mitigation project map</h1>
        <p><b>{fmtInt(h.projects)}</b> projects in {fmtInt(h.projectCounties)} counties from public records, set against FEMA wildfire risk and county funding. <b style={{ color: 'var(--brand)' }}>{fmtInt(seeking)}</b> are seeking funding.</p>
        <div className="row" style={{ marginTop: 18 }}><Link className="btn" href="/funding">Funding programs →</Link><Link className="link link-arrow" href="/submit-project">Submit a project</Link></div>
      </div>
      <PublicMap
        variant="full" categories={categoriesOpts} stages={PROJECT_STAGES.map((s) => [s[0], s[1]] as [string, string])} options={await projectFilterOptions()} counts={await layerCounts()}
        initial={{ q: sp.q ?? '', category: sp.category ?? '', stage: sp.stage ?? '', state: sp.state ?? '', county: sp.county ?? '', layers: sp.layers ? sp.layers.split(',').filter(Boolean) : undefined }}
      />
    </div>
  );
}
