import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and start Docker Compose.');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const migration = await readFile(
    fileURLToPath(new URL('../migrations/0001_initial.sql', import.meta.url)),
    'utf8',
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(migration);
  });
  console.log('Database migration complete.');
} finally {
  await sql.end();
}
