export type Feeds = { organizations: number; projects: number; programs: number; awards: number };

export function feedParts(f: Feeds): string[] {
  const out: string[] = [];
  if (f.organizations) out.push(`${f.organizations.toLocaleString('en-US')} organizations`);
  if (f.projects) out.push(`${f.projects.toLocaleString('en-US')} projects`);
  if (f.programs) out.push(`${f.programs.toLocaleString('en-US')} funding programs`);
  if (f.awards) out.push(`${f.awards.toLocaleString('en-US')} funding awards`);
  return out;
}
export const feedTotal = (f: Feeds) => f.organizations + f.projects + f.programs + f.awards;
