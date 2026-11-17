import { databaseLabel, scalar, closeDatabase } from '../src/lib/db';
import { resetDatabase, seedDatabase } from '../src/lib/seed';

async function main() {
  const reset = process.argv.includes('--reset');
  const noDemo = process.argv.includes('--no-demo');
  const existing = await scalar<number>('SELECT COUNT(*) FROM users');
  if (existing > 0 && !reset) {
    console.error(`The database (${databaseLabel()}) already has data. Run with --reset to start over and reseed.`);
    process.exit(1);
  }
  if (reset) await resetDatabase();
  const password = process.env.SEED_PASSWORD || 'trusemble-dev';
  const out = await seedDatabase({ password, demo: !noDemo });
  console.log('Seeded', out);
  console.log(`Operators can sign in at /ops/login with adam@example.org, likitha@example.org or mike@example.org and password "${password}".`);
  if (password === 'trusemble-dev') console.log('That is the development default. Set SEED_PASSWORD, or use npm run user:create, before any shared deployment.');
  await closeDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
