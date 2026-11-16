import { get } from './db';
import { label, REQUEST_KINDS } from './constants';
import { sendAlert } from './notify';

/** Tell the team a request just arrived. Names the group and the project, never a person's contact details. */
export async function notifyNewRequest(ref: string) {
  const r = get<{ id: number; kind: string; from_name: string; amount_text: string | null; project: string | null }>(
    `SELECT r.id, r.kind, r.from_name, r.amount_text, p.name project FROM requests r LEFT JOIN projects p ON p.id = r.project_id WHERE r.ref = ?`, ref,
  );
  if (!r) return;
  await sendAlert({
    title: `New ${label(REQUEST_KINDS, r.kind).toLowerCase()} from ${r.from_name}`,
    lines: [`Reference ${ref}`, ...(r.project ? [`Project: ${r.project}`] : []), ...(r.amount_text ? [`Amount: ${r.amount_text}`] : []), 'A person should reply within two business days.'],
    path: `/ops/requests/${r.id}`,
  });
}
