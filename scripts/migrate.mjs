import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL is required for migrations.');
const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('sentinelle-migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS public.sentinelle_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = new URL('../database/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const previous = await client.query('SELECT sha256 FROM public.sentinelle_migrations WHERE name=$1', [name]);
    if (previous.rowCount) {
      if (previous.rows[0].sha256 !== hash) throw new Error(`Applied migration ${name} was modified.`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO public.sentinelle_migrations(name,sha256) VALUES($1,$2)', [name,hash]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { await client.end(); }
