import { readFile, writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import pg from 'pg';
import process from 'node:process';

const oldEnv = await readFile('.env', 'utf8');
const sourceConfig = dotenv.parse(oldEnv);
const config = dotenv.parse(await readFile('.env.supabase.local', 'utf8'));
if (!config.SUPABASE_DB_PASSWORD) throw new Error('Save SUPABASE_DB_PASSWORD in .env.supabase.local first.');
const url = new URL(`postgresql://${config.SUPABASE_DB_HOST}:6543/postgres`);
url.username = `postgres.${config.SUPABASE_PROJECT_REF}`;
url.password = config.SUPABASE_DB_PASSWORD;
if (sourceConfig.DATABASE_PROVIDER === 'supabase') throw new Error('The app already uses Supabase; migration stopped.');
const source = new pg.Client({ connectionString: sourceConfig.DATABASE_URL });
const target = new pg.Client({
  connectionString: url.href,
  ssl: { rejectUnauthorized: true, ca: await readFile('supabase/prod-ca-2021.crt', 'utf8') },
  connectionTimeoutMillis: 15000
});
const tables = ['profiles', 'listings', 'bookings', 'lesson_feedback', 'conversations',
  'messages', 'booking_venue_log', 'notification_reads', 'account_sessions', 'token_transactions'];
const quote = value => `"${value.replaceAll('"', '""')}"`;
try {
  await source.connect();
  await target.connect();
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = {};
  for (const table of tables) snapshot[table] = (await source.query(`SELECT * FROM public.${quote(table)}`)).rows;
  await writeFile('.database-backup.local', JSON.stringify(snapshot));
  await writeFile('.env.pgadmin.local', oldEnv);
  await target.query('BEGIN');
  await target.query(await readFile('supabase/migrations/20261014000000_initial_wolly_up.sql', 'utf8'));
  for (const table of tables) {
    const count = (await target.query(`SELECT count(*)::int AS count FROM public.${quote(table)}`)).rows[0].count;
    if (count !== 0) throw new Error(`Target ${table} is not empty; stopped without overwriting data.`);
    const columns = (await target.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table])).rows;
    const jsonColumns = new Set(columns.filter(c => ['json', 'jsonb'].includes(c.data_type)).map(c => c.column_name));
    for (const row of snapshot[table]) {
      const keys = Object.keys(row);
      const values = keys.map(key => jsonColumns.has(key) && row[key] !== null ? JSON.stringify(row[key]) : row[key]);
      await target.query(`INSERT INTO public.${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, values);
    }
    const copied = (await target.query(`SELECT count(*)::int AS count FROM public.${quote(table)}`)).rows[0].count;
    if (copied !== snapshot[table].length) throw new Error(`Count mismatch for ${table}.`);
    console.log(`${table}: ${copied} records preserved`);
  }
  await target.query('COMMIT');
  await source.query('COMMIT');
  const env = oldEnv.split(/\r?\n/).filter(line => !/^(DATABASE_URL|DATABASE_PROVIDER)=/.test(line)).join('\n').trim();
  await writeFile('.env', `${env ? `${env}\n` : ''}DATABASE_URL='${url.href}'\nDATABASE_PROVIDER=supabase\n`);
  console.log('App connected to Supabase. Original database remains intact; local backups are ignored by Git.');
} catch (error) {
  await target.query('ROLLBACK').catch(() => {});
  await source.query('ROLLBACK').catch(() => {});
  console.error('Migration stopped:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
