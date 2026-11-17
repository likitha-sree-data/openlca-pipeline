import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OpsPage } from '@/components/ops/Shell';
import { PageHead } from '@/components/ops/ui';
import { EntityForm } from '@/components/ops/EntityForm';
import { entityBySlug } from '@/lib/entities';
import { userOptions } from '@/lib/crud';
import { saveEntity } from '@/app/ops/actions';
import { get } from '@/lib/db';

export const metadata: Metadata = { title: 'New record' };

const DEFAULTS: Record<string, Record<string, string | number>> = {
  organizations: { type: 'other', published: 1 },
  projects: { stage: 'planning', category: 'wildfire_mitigation', published: 0 },
  contacts: {},
  programs: { type: 'grant', scope: 'national', published: 1 },
  requests: { kind: 'inquiry', status: 'new' },
};

export default async function NewEntity({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const cfg = entityBySlug((await params).entity);
  if (!cfg) notFound();
  const sp = await searchParams;
  // allow prefilling reference fields from the URL, e.g. /ops/requests/new?org_id=12
  const values: Record<string, string | number> = { ...DEFAULTS[cfg.key] };
  const refLabels: Record<string, string> = {};
  for (const f of cfg.fields) {
    const v = sp[f.name];
    if (v && /^[\w\s.,@$-]{1,200}$/.test(v)) values[f.name] = v;
    if (f.type === 'ref' && f.ref && f.ref !== 'users' && values[f.name]) {
      const t = f.ref;
      const n = (await get<{ n: string }>(`SELECT name n FROM ${t} WHERE id = ?`, Number(values[f.name])))?.n;
      if (n) refLabels[f.name] = n;
    }
  }
  return (
    <OpsPage section={`New ${cfg.singular}`}>
      <p className="small"><Link className="link" href={`/ops/${cfg.slug}`}>← {cfg.plural[0].toUpperCase() + cfg.plural.slice(1)}</Link></p>
      <PageHead title={cfg.newLabel} />
      <div className="card" style={{ marginTop: 18 }}>
        <EntityForm fields={cfg.fields} values={values} refLabels={refLabels} userOpts={await userOptions()} action={saveEntity.bind(null, cfg.slug, null)} submitLabel={`Create ${cfg.singular}`} cancelHref={`/ops/${cfg.slug}`} />
      </div>
    </OpsPage>
  );
}
