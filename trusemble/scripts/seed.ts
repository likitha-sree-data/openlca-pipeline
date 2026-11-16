import { dbPath, db } from '../src/lib/db';
import { resetDatabase, seedDatabase } from '../src/lib/seed';

const reset = process.argv.includes('--reset');
const noDemo = process.argv.includes('--no-demo');
const existing = (db().prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n;
if (existing > 0 && !reset) {
  console.error(`Database ${dbPath()} already has data. Run with --reset to wipe and reseed.`);
  process.exit(1);
}
if (reset) resetDatabase();
const password = process.env.SEED_PASSWORD || 'trusemble-dev';
const out = seedDatabase({ password, demo: !noDemo });
console.log('Seeded', out);
console.log(`Operators can sign in at /ops/login with adam@example.org, likitha@example.org or mike@example.org and password "${password}".`);
if (password === 'trusemble-dev') console.log('That is the development default. Set SEED_PASSWORD, or use npm run user:create, before any shared deployment.');
