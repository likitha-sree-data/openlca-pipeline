import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OpsPage } from '@/components/ops/Shell';
import { Prio, StatusPill, VerifPill } from '@/components/ops/ui';
import { EntityForm } from '@/components/ops/EntityForm';
import { entityBySlug } from '@/lib/entities';
import { getRow, userOptions } from '@/lib/crud';
import { archiveAction, saveEntity } from '@/app/ops/actions';
import { get } from '@/lib/db';
import { RequestView } from './RequestView';
import { ProjectView } from './ProjectView';
import { ProgramView } from './ProgramView';
import { OrganizationView } from './OrganizationView';
import { ContactView } from './ContactView';

type Row = Record<string, string | number | null>;

export async function generateMetadata({ params }: { params: Promise<{ entity: string; id: string }> }): Promise<Metadata> {
  const { entity, id } = await params;
  const cfg = entityBySlug(entity);
  const row = cfg && /^\d+$/.test(id) ? await getRow<Row>(cfg, Number(id)) : undefined;
  return { title: row ? String(row[cfg!.titleCol]) : 'Not found' };
}

const TITLES: Record<string, string> = { requests: 'Request', projects: 'Project', programs: 'Funding program', organizations: 'Organization', contacts: 'Contact' };

/** Every kind of record opens as a page built around what the team does with it. The full edit form is one click away. */
export default async function EntityDetail({ params, searchParams }: { params: Promise<{ entity: string; id: string }>; searchParams: Promise<{ created?: string; notice?: string }> }) {
  const { entity, id } = await params;
  const cfg = entityBySlug(entity);
  if (!cfg || !/^\d+$/.test(id)) notFound();
  const rid = Number(id);
  const row = await getRow<Row>(cfg, rid);
  if (!row) notFound();
  const sp = await searchParams;
  const users = await userOptions();

  const refLabels: Record<string, string> = {};
  for (const f of cfg.fields) {
    if (f.type === 'ref' && f.ref && f.ref !== 'users' && row[f.name]) {
      refLabels[f.name] = (await get<{ n: string }>(`SELECT name n FROM ${f.ref} WHERE id = ?`, Number(row[f.name])))?.n ?? '';
    }
  }
  const archived = !!row.archived;
  const view =
    cfg.key === 'requests' ? <RequestView id={rid} users={users} />
    : cfg.key === 'projects' ? <ProjectView id={rid} row={row} />
    : cfg.key === 'programs' ? <ProgramView id={rid} row={row} />
    : cfg.key === 'organizations' ? <OrganizationView id={rid} row={row} />
    : <ContactView id={rid} row={row} users={users} />;

  return (
    <OpsPage section={TITLES[cfg.key]}>
      <p className="small"><Link className="link" href={`/ops/${cfg.slug}`}>← {cfg.plural[0].toUpperCase() + cfg.plural.slice(1)}</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', margin: '8px 0 6px', alignItems: 'flex-start' }}>
        <div>
          <h1>{String(row[cfg.titleCol])}</h1>
          <p className="row" style={{ marginTop: 8 }}>
            {cfg.key === 'requests' && <><span className="muted">{String(row.ref)}</span><StatusPill status={String(row.status)} />{row.priority ? <Prio p={row.priority as string} /> : null}</>}
            <VerifPill v={String(row.verification)} />
            {archived && <span className="pill bad">Archived</span>}
            {cfg.key === 'contacts' && row.do_not_contact ? <span className="pill bad">Do not contact</span> : null}
            {cfg.key === 'projects' && row.published ? <Link className="link small" href={`/projects/${rid}`}>See it on the website</Link> : null}
          </p>
        </div>
        <form action={archiveAction.bind(null, cfg.slug, rid, !archived)}><button className="btn sm">{archived ? 'Restore' : 'Archive'}</button></form>
      </div>
      {sp.created && <div className="alert ok" role="status" style={{ margin: '12px 0' }}>Created. You can keep editing below.</div>}
      {sp.notice && <div className="alert ok" role="status" style={{ margin: '12px 0' }}>{sp.notice.slice(0, 300)}</div>}

      {view}
      <details className="card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Edit all the details</summary>
        <div style={{ marginTop: 14 }}><EntityForm fields={cfg.fields} values={row} refLabels={refLabels} userOpts={users} action={saveEntity.bind(null, cfg.slug, rid)} submitLabel="Save changes" /></div>
      </details>
    </OpsPage>
  );
}
