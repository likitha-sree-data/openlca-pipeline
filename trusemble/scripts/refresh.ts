// Nightly refresh: bring in fresh public data and tell the team if a source stopped working. Schedule with cron: 0 3 * * * npm run refresh
import { FETCHERS } from '../src/lib/ingest';
import { runFetcher } from '../src/lib/ingest/runner';
import { sendAlert } from '../src/lib/notify';

async function main() {
  const failed: string[] = [];
  for (const f of FETCHERS) {
    const r = await runFetcher(f);
    console.log(`${r.ok ? 'done  ' : 'FAILED'} ${f.id}: ${r.stats.new} new, ${r.stats.updated} updated, ${r.stats.skipped} skipped`);
    if (!r.ok) failed.push(`${f.name}: ${r.error ?? 'unknown problem'}`);
  }
  if (failed.length) {
    await sendAlert({ title: `${failed.length} data source${failed.length === 1 ? '' : 's'} could not be refreshed`, lines: [...failed, '', 'Everything else was refreshed. The old data is still there.'], path: '/ops/sources' });
    process.exit(1);
  }
}
main();
