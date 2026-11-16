import { sendAlert, alertChannels } from '../src/lib/notify';
import { weeklySummary } from '../src/lib/summary';

async function main() {
  const a = weeklySummary();
  console.log([a.title, ...a.lines].join('\n'));
  if (!alertChannels().email && !alertChannels().webhook) { console.log('\nNo alerts are set up, so nothing was sent. See Settings, Alerts.'); return; }
  const r = await sendAlert(a);
  console.log(`\nSent by: ${r.sent.join(', ') || 'nothing'}${r.failed.length ? `. Failed: ${r.failed.join(', ')}` : ''}`);
  if (r.failed.length) process.exit(1);
}
main();
