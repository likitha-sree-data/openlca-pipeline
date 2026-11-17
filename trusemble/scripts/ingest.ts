import { FETCHERS, byId } from '../src/lib/ingest';
import { runFetcher } from '../src/lib/ingest/runner';
import { all, run, scalar } from '../src/lib/db';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 0;
const names = args.filter((a, i) => !a.startsWith('--') && i !== limitIdx + 1);

function usage() {
  console.log(`Usage: npm run ingest -- <fetcher...|all|list|clear-demo> [--limit N]

Fetchers (run in this order for "all"):
${FETCHERS.map((f) => `  ${f.id.padEnd(16)} ${f.name}`).join('\n')}

  list         show every source and when it last ran
  clear-demo   delete the generated demo rows (run after a real ingest)

--limit N     stop after about N rows, to try a fetcher before a full run`);
}

async function main() {
  if (names.length === 0) return usage();
  if (names[0] === 'list') {
    for (const s of await all<{ slug: string; last_fetched_at: string | null }>('SELECT slug, last_fetched_at FROM sources ORDER BY slug')) console.log(`${(s.slug ?? '').padEnd(32)} ${s.last_fetched_at ?? 'never'}`);
    return;
  }
  if (names[0] === 'clear-demo') {
    const n = await scalar<number>(`SELECT COUNT(*) FROM projects WHERE verification = 'demo'`);
    for (const t of ['awards', 'projects', 'contacts', 'organizations', 'counties']) await run(`DELETE FROM ${t} WHERE verification = 'demo'`);
    await run(`DELETE FROM sources WHERE verification = 'demo'`);
    console.log(`Removed demo rows (${n} projects and everything that pointed at them).`);
    return;
  }
  const list = names[0] === 'all' ? FETCHERS : names.map((n) => byId(n) ?? (console.error(`Unknown fetcher "${n}"`), process.exit(1)) as never);
  let failed = 0;
  for (const f of list) {
    const r = await runFetcher(f, { limit });
    console.log(`${r.ok ? 'done  ' : 'FAILED'} ${f.id}: ${r.stats.new} new, ${r.stats.updated} updated, ${r.stats.unchanged} unchanged, ${r.stats.skipped} skipped${r.error ? ` (${r.error})` : ''}`);
    if (!r.ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}
main();
