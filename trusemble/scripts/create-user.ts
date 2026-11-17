import { scryptSync, randomBytes } from 'node:crypto';
import { closeDatabase, run } from '../src/lib/db';
import { initials } from '../src/lib/text';

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password || password.length < 10) {
    console.error('Usage: npm run user:create -- "Full Name" email@example.org "a-password-of-10+-chars"');
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
  await run(
    `INSERT INTO users (name, email, initials, password_hash) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash`,
    name, email.toLowerCase(), initials(name), hash,
  );
  console.log(`Saved operator ${name} <${email}>.`);
  await closeDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
