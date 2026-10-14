import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { verificationSchema } from '../server/verification.js';
import { bookingSchema } from '../server/bookings.js';
import { inboxSchema } from '../server/inbox.js';
import { listingSchema } from '../server/listings.js';
import { tokenSchema } from '../server/tokens.js';

// Keep the first Supabase migration aligned with the existing server schema.
const sql = [
  '-- Initial schema for the current Wolly Up application.',
  await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'),
  verificationSchema, bookingSchema, inboxSchema, listingSchema, tokenSchema,
  await readFile(new URL('../server/supabase-security.sql', import.meta.url), 'utf8')
].join('\n;\n\n');
const directory = new URL('../supabase/migrations/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('20261014000000_initial_wolly_up.sql', directory), `${sql.trim()}\n`);
console.log('Exported current application schema to supabase/migrations.');
