import { emptyAllTables, useMemoryDatabase } from '../src/lib/db';

let ready = false;

/**
 * An empty database for the test.
 * Default: an in-memory embedded Postgres, started once per test file.
 * With TEST_DATABASE_URL set: a real Postgres server (run with --no-file-parallelism, since files share it).
 */
export async function freshDb(): Promise<void> {
  if (!ready) {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    else await useMemoryDatabase();
    ready = true;
  }
  await emptyAllTables();
}
