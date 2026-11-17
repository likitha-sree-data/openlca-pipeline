import type { MetadataRoute } from 'next';
import { all } from '@/lib/db';
import { publicRows } from '@/lib/visibility';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const pages = ['', '/projects', '/funding', '/data', '/calculator', '/request-funding', '/submit-project', '/contact', '/fund', '/about', '/privacy', '/terms'];
  const projects = await all<{ id: number; updated_at: string }>(`SELECT id, updated_at FROM projects p WHERE ${publicRows('p')} ORDER BY id LIMIT 5000`);
  return [...pages.map((p) => ({ url: base + p })), ...projects.map((p) => ({ url: `${base}/projects/${p.id}`, lastModified: p.updated_at }))];
}
