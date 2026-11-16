import type { Metadata } from 'next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead } from '@/components/ops/ui';
import { all, scalar } from '@/lib/db';
import { fmtInt } from '@/lib/format';
import { label, ORG_TYPES, PROJECT_STAGES } from '@/lib/constants';

export const metadata: Metadata = { title: 'Map' };
const OpsMap = dynamic(() => import('@/components/ops/OpsMap'), { loading: () => <div className="map-wrap tall" /> });

export default async function OpsMapPage({ searchParams }: { searchParams: Promise<{ layers?: string }> }) {
  const sp = await searchParams;
  const layers = (sp.layers ?? 'projects,organizations').split(',').filter((l) => ['projects', 'organizations'].includes(l));
  const useP = layers.includes('projects'), useO = layers.includes('organizations');
  const nP = scalar<number>('SELECT COUNT(*) FROM projects WHERE archived = 0');
  const nO = scalar<number>('SELECT COUNT(*) FROM organizations WHERE archived = 0');
  const unmapped = (useP ? scalar<number>('SELECT COUNT(*) FROM projects WHERE archived = 0 AND lat IS NULL') : 0) + (useO ? scalar<number>('SELECT COUNT(*) FROM organizations WHERE archived = 0 AND lat IS NULL') : 0);
  const rows = all<{ kind: string; id: number; name: string; verification: string; sub: string | null; county: string | null }>(
    `SELECT * FROM (
       ${useP ? "SELECT 'Project' kind, id, name, verification, stage sub, county FROM projects WHERE archived = 0" : "SELECT 'x' kind, 0 id, '' name, '' verification, '' sub, '' county WHERE 0"}
       UNION ALL
       ${useO ? "SELECT 'Organization', id, name, verification, type, county FROM organizations WHERE archived = 0" : "SELECT 'x', 0, '', '', '', '' WHERE 0"}
     ) ORDER BY name COLLATE NOCASE LIMIT 100`,
  );
  const href = (l: string[]) => `/ops/map?layers=${l.join(',')}`;
  return (
    <OpsPage section="Map">
      <PageHead title="Map">Every project and organization on record, published or not. Hollow markers are private; the public map shows only published ones.</PageHead>
      <div className="card" style={{ marginTop: 18, padding: 14 }}>
        <div className="seg" role="group" aria-label="Layers" style={{ marginBottom: 12 }}>
          <Link href={href(useP ? layers.filter((l) => l !== 'projects') : [...layers, 'projects'])} className={useP ? 'on' : ''}>Projects <span className="muted">{fmtInt(nP)}</span></Link>
          <Link href={href(useO ? layers.filter((l) => l !== 'organizations') : [...layers, 'organizations'])} className={useO ? 'on' : ''}>Organizations <span className="muted">{fmtInt(nO)}</span></Link>
        </div>
        <OpsMap layers={layers} />
        <p className="small" style={{ margin: '14px 4px 6px' }}><b className="num">{fmtInt((useP ? nP : 0) + (useO ? nO : 0))}</b> records in the selected layers (all statuses) · <b className="num">{fmtInt(unmapped)}</b> unmapped</p>
        <div className="list-panel" style={{ maxHeight: 360 }}>
          {rows.map((r) => <Link key={r.kind + r.id} href={`/ops/${r.kind === 'Project' ? 'projects' : 'organizations'}/${r.id}`} className="list-item"><b style={{ fontSize: 16 }}>{r.name}</b><span>{r.kind} · {r.verification} · {r.kind === 'Project' ? label(PROJECT_STAGES, r.sub) : label(ORG_TYPES, r.sub)}{r.county ? ` · ${r.county}` : ''}</span></Link>)}
        </div>
      </div>
    </OpsPage>
  );
}
